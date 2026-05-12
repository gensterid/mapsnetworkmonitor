import { logger } from '../logger.js';
import { safeWrite } from './connection.js';
import { parseMikrotikDate, parseMikrotikInterval, parseUptimeToSeconds, parseLatencyValue } from './utils.js';
import { RouterInterfaceData, NetwatchData, RouterNeighbor, RomonNeighbor, PppSession, SimpleQueueData } from './types.js';

/**
 * Get router interfaces with traffic rates
 */
export async function getRouterInterfaces(api: any): Promise<RouterInterfaceData[]> {
    const interfacesResult = await safeWrite(api, '/interface/print');
    let ethernetSpeeds: Map<string, string> = new Map();

    try {
        const ethernetResult = await safeWrite(api, '/interface/ethernet/print');
        const runningEthernetIds: string[] = [];

        ethernetResult.forEach((eth: any) => {
            if (eth.name) {
                if (eth.speed) ethernetSpeeds.set(eth.name, eth.speed);
                const isRunning = eth.running === true || eth.running === 'true';
                if (isRunning && eth['.id']) runningEthernetIds.push(eth['.id']);
            }
        });

        if (runningEthernetIds.length > 0) {
            await Promise.all(runningEthernetIds.map(async (id) => {
                try {
                    const monitorResult = await Promise.race([
                        safeWrite(api, ['/interface/ethernet/monitor', `=numbers=${id}`, '=once=']),
                        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                    ]) as any[];

                    if (monitorResult && monitorResult.length > 0) {
                        const status = monitorResult[0];
                        if (status.name && status.rate) ethernetSpeeds.set(status.name, status.rate);
                    }
                } catch (monitorErr) { /* ignore */ }
            }));
        }
    } catch (err) { /* ignore */ }

    return interfacesResult.map((iface: any) => {
        const parseIntSafe = (val: any) => typeof val === 'number' ? val : parseInt(val || '0', 10);
        return {
            name: iface.name,
            defaultName: iface['default-name'],
            type: iface.type,
            macAddress: iface['mac-address'],
            running: iface.running === true || iface.running === 'true',
            disabled: iface.disabled === true || iface.disabled === 'true',
            txBytes: parseIntSafe(iface['tx-byte']),
            rxBytes: parseIntSafe(iface['rx-byte']),
            txPackets: parseIntSafe(iface['tx-packet']),
            rxPackets: parseIntSafe(iface['rx-packet']),
            txDrops: parseIntSafe(iface['tx-drop']),
            rxDrops: parseIntSafe(iface['rx-drop']),
            txErrors: parseIntSafe(iface['tx-error']),
            rxErrors: parseIntSafe(iface['rx-error']),
            speed: ethernetSpeeds.get(iface.name) || iface.speed,
            comment: iface.comment,
            txRate: 0,
            rxRate: 0,
        };
    });
}

/**
 * Patterns for interfaces that should NOT be polled for traffic.
 * These are management/virtual/tunnel interfaces that either don't carry
 * customer traffic or are owned by overlay networks (ZeroTier, WireGuard).
 * Skipping them cuts polling load substantially on routers with many VLANs
 * (e.g., genster: 160 interfaces -> often 60-80% are PPPoE/VLAN sub-interfaces
 * whose throughput is already captured by their parent or via SNMP).
 *
 * Override per-router by setting router_interfaces.exclude_from_traffic=true.
 */
const SKIP_TRAFFIC_PATTERNS: RegExp[] = [
    /^lo$/i,                  // loopback
    /^zerotier/i,             // ZeroTier overlay
    /^wg/i,                   // WireGuard
    /^l2tp-/i,                // L2TP dial-out tunnels
    /^pptp-/i,                // PPTP dial-out tunnels
    /^sstp-/i,                // SSTP dial-out tunnels
    /^ovpn-/i,                // OpenVPN dial-out tunnels
    /^<pppoe-.+>$/i,          // Per-client PPPoE virtual interfaces
    /^pppoe-out\d+$/i,        // PPPoE client side
];

export function shouldPollTraffic(interfaceName: string): boolean {
    if (!interfaceName) return false;
    for (const re of SKIP_TRAFFIC_PATTERNS) {
        if (re.test(interfaceName)) return false;
    }
    return true;
}

/**
 * Get interface traffic consumption
 */
export async function getInterfaceTraffic(
    api: any, interfaces: string[]
): Promise<Map<string, { tx: number; rx: number }>> {
    if (!interfaces || interfaces.length === 0) return new Map();
    const filtered = interfaces.filter(shouldPollTraffic);
    if (filtered.length === 0) return new Map();
    const trafficMap = new Map<string, { tx: number; rx: number }>();
    const CHUNK_SIZE = 10;
    for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
        const chunk = filtered.slice(i, i + CHUNK_SIZE);
        try {
            const result = await safeWrite(api, ['/interface/monitor-traffic', `=interface=${chunk.join(',')}`, '=once=']);
            result.forEach((res: any) => {
                if (res.name) trafficMap.set(res.name, {
                    tx: parseInt(res['tx-bits-per-second'] || '0', 10),
                    rx: parseInt(res['rx-bits-per-second'] || '0', 10)
                });
            });
        } catch (err) {
            logger.error({ err, chunk }, 'Failed to monitor traffic');
        }
    }
    return trafficMap;
}

/**
 * Get Netwatch hosts
 */
export async function getNetwatchHosts(api: any, routerClock?: any): Promise<NetwatchData[]> {
    const hostsResult = await safeWrite(api, '/tool/netwatch/print');
    let timeOffset = 0;
    
    if (routerClock) {
        try {
            const routerNow = parseMikrotikDate(`${routerClock.date} ${routerClock.time}`);
            const serverNow = new Date();
            timeOffset = serverNow.getTime() - routerNow.getTime();
        } catch (e) { /* ignore */ }
    }

    return hostsResult.map((host: any) => {
        let sinceUp: Date | undefined;
        let sinceDown: Date | undefined;
        const rawSince = host.since || host['since-up'] || host['since-down'];
        
        if (rawSince) {
            try {
                const sinceDate = parseMikrotikDate(rawSince);
                if (timeOffset !== 0) sinceDate.setTime(sinceDate.getTime() + timeOffset);
                if (host.status === 'up') sinceUp = sinceDate;
                else if (host.status === 'down') sinceDown = sinceDate;
            } catch (e) { }
        }

        const pickBest = (item: any, type: string) => {
            const candidates = Object.keys(item || {})
                .filter(k => k.toLowerCase().includes(type) && k.toLowerCase().includes('script'))
                .map(k => String(item[k] || ''));
            
            const withWebhook = candidates.find(c => c.toLowerCase().includes('/api/webhook/netwatch'));
            if (withWebhook) return withWebhook;
            return candidates.sort((a, b) => b.length - a.length)[0] || '';
        };

        return {
            host: host.host,
            name: host.name,
            comment: host.comment,
            status: host.status,
            timeout: parseInt(host.timeout || '1000', 10),
            interval: parseMikrotikInterval(host.interval || '10s'),
            sinceUp,
            sinceDown,
            disabled: host.disabled === true || host.disabled === 'true' || host.disabled === 'yes',
            upScript: pickBest(host, 'up'),
            downScript: pickBest(host, 'down'),
            _id: host['.id'],
        };
    });
}

/**
 * Add Netwatch entry
 */
export async function addNetwatchEntry(
    api: any,
    data: { host: string; interval?: number; timeout?: number; comment?: string }
): Promise<void> {
    const params: string[] = [`=host=${data.host}`];
    if (data.interval) params.push(`=interval=${data.interval}s`);
    else params.push('=interval=30s');
    if (data.timeout) params.push(`=timeout=${data.timeout}ms`);
    else params.push('=timeout=1000ms');
    if (data.comment) params.push(`=comment=${data.comment}`);

    await safeWrite(api, ['/tool/netwatch/add', ...params]);
}

/**
 * Update Netwatch entry
 */
export async function updateNetwatchEntry(
    api: any,
    host: string,
    data: { host?: string; interval?: number; timeout?: number; comment?: string }
): Promise<void> {
    const entries = await safeWrite(api, ['/tool/netwatch/print', `?host=${host}`]);
    if (entries.length === 0) throw new Error(`Netwatch entry for host ${host} not found`);
    const id = entries[0]['.id'];
    const params: string[] = [`=.id=${id}`];
    if (data.host) params.push(`=host=${data.host}`);
    if (data.interval) params.push(`=interval=${data.interval}s`);
    if (data.timeout) params.push(`=timeout=${data.timeout}ms`);
    if (data.comment !== undefined) params.push(`=comment=${data.comment}`);

    if (params.length > 1) await safeWrite(api, ['/tool/netwatch/set', ...params]);
}

/**
 * Remove Netwatch entry
 */
export async function removeNetwatchEntry(api: any, host: string): Promise<void> {
    const entries = await safeWrite(api, ['/tool/netwatch/print', `?host=${host}`]);
    if (entries.length > 0) {
        await safeWrite(api, ['/tool/netwatch/remove', `=.id=${entries[0]['.id']}`]);
    }
}

/**
 * Configure Netwatch Webhook (Smart Append)
 */
/**
 * Marker comment placed on the line directly before our webhook fetch.
 * RouterOS treats `#` as a comment, so it's preserved through edits and
 * round-trips through `/tool netwatch print`. Detection becomes a single
 * exact-string search, eliminating the fragile normalised-substring check
 * that was causing the sync loop to re-inject every cycle.
 */
const WEBHOOK_MARKER = '# maps-monitor-webhook v1';

export async function configureNetwatchWebhook(
    api: any,
    host: string,
    webhookUrl: string,
    webhookToken: string,
    nw?: any,
    forceOverwrite: boolean = false
): Promise<void> {
    const entries = await safeWrite(api, ['/tool/netwatch/print', `?host=${host}`]);
    if (entries.length === 0) return;

    const entry = entries[0];
    const cleanUrl = webhookUrl.split('?token=')[0];
    const headers = `Authorization: Bearer ${webhookToken},User-Agent: Mozilla/5.0 (Mikrotik Monitor)`;
    const upCommand = `${WEBHOOK_MARKER}\r\n:delay 1s; /tool fetch url="${cleanUrl}&host=${host}&status=up" http-header-field="${headers}" keep-result=no;`;
    const downCommand = `${WEBHOOK_MARKER}\r\n:delay 1s; /tool fetch url="${cleanUrl}&host=${host}&status=down" http-header-field="${headers}" keep-result=no;`;

    /**
     * Strip any previously-injected webhook block(s) from the script. We
     * remove the marker line and the very next non-empty line (the fetch
     * command). This handles scripts bloated by past versions of this
     * function that re-appended on every cycle.
     */
    const stripWebhookBlocks = (script: string): string => {
        const lines = script.split(/\r?\n/);
        const kept: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes(WEBHOOK_MARKER)) {
                // skip marker line + the following fetch line
                let j = i + 1;
                while (j < lines.length && lines[j].trim() === '') j++;
                if (j < lines.length && lines[j].toLowerCase().includes('/api/webhook/netwatch')) {
                    i = j; // consume the fetch line too
                }
                continue;
            }
            // Also strip orphan webhook fetch lines from pre-marker versions of this code
            if (line.toLowerCase().includes('/api/webhook/netwatch') && (!webhookToken || line.includes(webhookToken))) {
                continue;
            }
            kept.push(line);
        }
        return kept.join('\r\n').trim();
    };

    const buildScript = (existing: string, command: string): { script: string; modified: boolean } => {
        const hasMarker = existing.includes(WEBHOOK_MARKER) && existing.includes('/api/webhook/netwatch') && existing.includes(webhookToken);
        if (hasMarker && !forceOverwrite) {
            return { script: existing, modified: false };
        }
        const cleaned = stripWebhookBlocks(existing);
        const separator = cleaned ? '\r\n' : '';
        return { script: `${cleaned}${separator}${command}`, modified: true };
    };

    const upRes = buildScript(entry['up-script'] || '', upCommand);
    const downRes = buildScript(entry['down-script'] || '', downCommand);

    const params: string[] = [`/tool/netwatch/set`, `=.id=${entry['.id']}`];
    if (upRes.modified) params.push(`=up-script=${upRes.script}`);
    if (downRes.modified) params.push(`=down-script=${downRes.script}`);

    if (params.length > 2) await safeWrite(api, params);
}

/**
 * Remove Netwatch Webhook (Smart Cleanup)
 */
export async function removeNetwatchWebhook(
    api: any, 
    host: string, 
    secret: string,
    nw?: any
): Promise<void> {
    const entries = await safeWrite(api, ['/tool/netwatch/print', `?host=${host}`]);
    if (entries.length === 0) return;

    const entry = entries[0];
    const clean = (script: string) => {
        const lines = script.split(/\r?\n/);
        const kept: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Strip our marker line + the following fetch line as a block
            if (line.includes(WEBHOOK_MARKER)) {
                let j = i + 1;
                while (j < lines.length && lines[j].trim() === '') j++;
                if (j < lines.length && lines[j].toLowerCase().includes('/api/webhook/netwatch')) {
                    i = j;
                }
                continue;
            }
            // Also strip any standalone webhook fetch lines (pre-marker versions)
            const isWebhook = line.toLowerCase().includes('/api/webhook/netwatch');
            if (isWebhook && (!secret || line.includes(secret))) continue;
            kept.push(line);
        }
        return kept.join('\r\n').trim();
    };

    const params: string[] = [`/tool/netwatch/set`, `=.id=${entry['.id']}`];
    let changed = false;
    if (entry['up-script']) { params.push(`=up-script=${clean(entry['up-script'])}`); changed = true; }
    if (entry['down-script']) { params.push(`=down-script=${clean(entry['down-script'])}`); changed = true; }

    if (changed) await safeWrite(api, params);
}

/**
 * Get MNDP Neighbors
 */
export async function getNeighbors(api: any): Promise<RouterNeighbor[]> {
    const result = await safeWrite(api, '/ip/neighbor/print');
    return result.map((n: any) => ({
        id: n['.id'] || n['mac-address'] || n['address'] || Math.random().toString(36).substring(7),
        identity: n.identity,
        address: n.address,
        macAddress: n['mac-address'],
        model: n.board || n.platform,
        version: n.version,
        interface: n.interface,
        uptime: n.uptime,
    }));
}

/**
 * Get RoMON neighbors
 */
export async function getRomonNeighbors(api: any): Promise<RomonNeighbor[]> {
    const neighbors: Map<string, RomonNeighbor> = new Map();
    const tryCmd = async (path: string) => {
        try {
            const res = await safeWrite(api, path);
            if (Array.isArray(res)) res.forEach(n => {
                const id = n['address'] || n['romon-id'] || n['id'] || n['.id'] || n['mac-address'];
                if (id) neighbors.set(id, {
                    romonId: id,
                    path: n.path || id,
                    mtu: parseInt(n.mtu || '0', 10),
                    identity: n.identity,
                    board: n.board || n.platform,
                    version: n.version,
                });
            });
        } catch { }
    };

    await tryCmd('/tool/romon/discovery/print');
    await tryCmd('/tool/romon/neighbor/print');
    return Array.from(neighbors.values());
}

// Simple cache for router compatibility (e.g. if it supports 'timeout' parameter in ping)
const routerPingCapabilities: Map<string, { supportsAdvanced: boolean }> = new Map();

/**
 * Measure ping latency with auto-retries and fallback for older firmware
 */
export async function measurePing(
    api: any, 
    address: string, 
    count: number = 3,
    interval: string = '100ms',
    timeout: string = '1000ms'
): Promise<{ latency: number, packetLoss: number, error?: string }> {
    const tryPing = async (params: string[]) => {
        const result = await safeWrite(api, ['/ping', `=address=${address}`, ...params]);
        if (result && result.length > 0) {
            let totalLatency = 0, receivedCount = 0, sentCount = count;
            for (const entry of result) {
                if (entry['sent']) sentCount = parseInt(entry['sent']);
                if (entry['received']) receivedCount = parseInt(entry['received']);
                if (entry['time']) {
                    const lat = parseLatencyValue(entry['time']);
                    if (lat >= 0) { totalLatency += lat; receivedCount++; }
                }
            }
            return {
                latency: receivedCount > 0 ? Math.round(totalLatency / receivedCount) : -1,
                packetLoss: Math.round(((sentCount - receivedCount) / sentCount) * 100)
            };
        }
        return null;
    };

    try {
        const capabilityKey = `${api.host || 'unknown'}`;
        const capability = routerPingCapabilities.get(capabilityKey);

        if (capability && !capability.supportsAdvanced) {
            const fallbackRes = await tryPing([`=count=${count}`]);
            if (fallbackRes) return fallbackRes;
            return { latency: -1, packetLoss: 100, error: 'Basic ping failed' };
        }

        try {
            // First try: full parameters
            const res = await tryPing([`=count=${count}`, `=interval=${interval}`, `=timeout=${timeout}`]);
            if (res) {
                if (!capability) routerPingCapabilities.set(capabilityKey, { supportsAdvanced: true });
                return res;
            }
            return { latency: -1, packetLoss: 100, error: 'Empty result' };
        } catch (e: any) {
            const msg = String(e.message || '').toLowerCase();
            
            // Fallback: If "unknown parameter" error (common on older ROS for 'timeout' or 'interval')
            if (msg.includes('unknown parameter') || msg.includes('no such parameter')) {
                routerPingCapabilities.set(capabilityKey, { supportsAdvanced: false });
                try {
                    logger.debug({ host: api.host, address }, '⚠️ Ping failed with unknown parameters. Persistent fallback enabled for this router.');
                    const fallbackRes = await tryPing([`=count=${count}`]);
                    if (fallbackRes) return fallbackRes;
                } catch (fallbackErr: any) {
                    return { latency: -1, packetLoss: 100, error: fallbackErr.message };
                }
            }
            throw e;
        }
    } catch (e: any) {
        return { latency: -1, packetLoss: 100, error: e.message };
    }
}

/**
 * Get active PPP sessions
 */
export async function getPppSessions(api: any): Promise<PppSession[]> {
    const result = await safeWrite(api, '/ppp/active/print');
    return result.map((session: any) => ({
        name: session.name,
        service: session.service,
        callerId: session['caller-id'],
        address: session.address,
        uptime: session.uptime,
        uptimeSeconds: parseUptimeToSeconds(session.uptime || '0s'),
        encoding: session.encoding,
        sessionId: session['session-id'],
        bytesIn: parseInt(session['bytes-in'] || '0', 10) || 0,
        bytesOut: parseInt(session['bytes-out'] || '0', 10) || 0,
    }));
}

/**
 * Get active session counts
 */
export async function getHotspotActive(api: any): Promise<number> {
    const result = await safeWrite(api, '/ip/hotspot/active/print');
    return result.length;
}

export async function getPppActive(api: any): Promise<number> {
    const result = await safeWrite(api, '/ppp/active/print');
    return result.length;
}

/**
 * Get Simple Queues
 */
export async function getSimpleQueues(api: any): Promise<SimpleQueueData[]> {
    const result = await safeWrite(api, '/queue/simple/print');
    return result.map((q: any) => ({
        name: q.name,
        target: q.target,
        rate: q['limit-at'],
        maxLimit: q['max-limit'],
        bytes: q.bytes,
        packets: q.packets,
        dynamic: q.dynamic === 'true' || q.dynamic === true,
        disabled: q.disabled === 'true' || q.disabled === true,
        comment: q.comment,
    }));
}
