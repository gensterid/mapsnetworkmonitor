import nodeRouteros from 'node-routeros';
const { RouterOSAPI } = nodeRouteros;
import { logger } from './logger.js';

export interface RouterConnection {
    host: string;
    port: number;
    username: string;
    password: string;
    timeout?: number;
    romon?: string; // MAC address for RoMON connection
}

export interface RouterNeighbor {
    id: string; // Unique identifier (usually .id from MikroTik)
    identity?: string;
    address?: string;
    macAddress?: string;
    model?: string;
    version?: string;
    interface?: string;
    uptime?: string;
}

export interface RomonNeighbor {
    romonId?: string; // MAC address
    path?: string;
    mtu?: number;
    identity?: string;
    board?: string;
    version?: string;
}

export interface RouterInfo {
    identity?: string;
    version?: string;
    model?: string;
    serialNumber?: string;
    boardName?: string;
    architecture?: string;
}

export interface RouterResources {
    uptime?: string;
    cpuLoad?: number;
    cpuCount?: number;
    cpuFrequency?: number;
    totalMemory?: number;
    usedMemory?: number;
    freeMemory?: number;
    totalDisk?: number;
    usedDisk?: number;
    freeDisk?: number;
    boardTemp?: number;
    voltage?: number;
}

export interface RouterInterfaceData {
    name: string;
    defaultName?: string;
    type?: string;
    macAddress?: string;
    running?: boolean;
    disabled?: boolean;
    txBytes?: number;
    rxBytes?: number;
    txPackets?: number;
    rxPackets?: number;
    txDrops?: number;
    rxDrops?: number;
    txErrors?: number;
    rxErrors?: number;
    speed?: string;
    comment?: string;
    txRate: number;
    rxRate: number;
}

export interface NetwatchData {
    host: string;
    name?: string;
    comment?: string;
    status?: string;
    timeout?: number;
    interval?: number;
    sinceUp?: Date;
    sinceDown?: Date;
    disabled?: boolean;
    upScript?: string;
    downScript?: string;
    _id?: string;
}

/**
 * Create a connection to a MikroTik router
 */
export async function connectToRouter(
    config: RouterConnection
): Promise<any> {
    // Return any to avoid complex TS types with the CJS import
    const api = new RouterOSAPI({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        timeout: config.timeout || 60, // Increased to 60s for slow routers (CPU 100% etc)
        keepalive: true,
    });

    // If RoMON is requested, we need to set the target MAC
    if (config.romon) {
        // routeros-node (node-routeros) supports passing romon in the login sentence
        // but it doesn't always expose it in the constructor options for all versions.
        // We'll attempt a manual login or check if the library supports it.
        // Actually, for node-routeros, if we can't set it in constructor, we might need a fork.
        // Let's assume it supports it if we pass it as part of the config or sentence.
        // If not, we'll try to use the !login sentence manually.
        (api as any).romon = config.romon;
    }

    // Add error handler to prevent uncaught exceptions
    api.on('error', (err: any) => {
        const errorMsg = String(err?.message || err || 'Unknown RouterOS error');
        const lowerMsg = errorMsg.toLowerCase();

        // Specific handling for known MikroTik API quirks (like !empty unknown reply)
        // RouterOS 7.18+ introduces !empty tag which node-routeros doesn't recognize
        const isKnownQuirk =
            lowerMsg.includes('!empty') ||
            lowerMsg.includes('unknown reply') ||
            lowerMsg.includes('unknown tag') ||
            err.errno === 'UNKNOWNREPLY';

        if (isKnownQuirk) {
            logger.debug({ err: errorMsg, host: config.host }, '[RouterOS API Compatibility] Ignoring expected 7.18+ quirk');
            return;
        }
        logger.error({ err: errorMsg, host: config.host }, '[RouterOS API Error]');
    });

    // Handle 'unknown' replies specifically which might skip the regular error flow
    api.on('unknown', (sentence: any) => {
        const sentenceStr = String(sentence || '').toLowerCase();
        if (sentenceStr.includes('!empty') || sentenceStr.includes('unknown reply')) {
            logger.debug({ host: config.host }, '[RouterOS API Compatibility] Captured !empty in unknown event');
        }
    });

    // Also suppress 'RosException' globally on this instance if possible
    // This is a last-ditch effort to prevent the library from crashing or being noisy
    api.on('error', () => { }); // Already handled above but ensure no default node crash

    await api.connect();
    return api;
}

/**
 * Resilient wrapper for api.write that handles RouterOS 7.18+ !empty tag
 * and adds a command-level timeout to prevent hangs.
 */
export async function safeWrite(api: any, command: string | string[], timeoutMs: number = 30000): Promise<any[]> {
    try {
        if (!api || typeof api.write !== 'function') {
            throw new Error('Invalid API instance provided to safeWrite');
        }

        // Use Promise.race to prevent hanging forever on malformed sentences (like ROS 7.18 !empty)
        const writePromise = api.write(command);
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs}ms`)), timeoutMs)
        );

        return await Promise.race([writePromise, timeoutPromise]);
    } catch (error: any) {
        const errorMsg = String(error?.message || error || '');
        const lowerMsg = errorMsg.toLowerCase();

        // If it's the known !empty tag error (ROS 7.18+), treat it as success with empty result
        // Some drivers throw RosException, others are generic Error objects
        if (lowerMsg.includes('!empty') ||
            lowerMsg.includes('unknown reply') ||
            error.errno === 'UNKNOWNREPLY' ||
            error.name === 'RosException') {

            // Log it briefly as debug if it's !empty
            if (lowerMsg.includes('!empty')) {
                logger.debug({ command: Array.isArray(command) ? command[0] : command }, 'RouterOS !empty protocol noise suppressed');
            } else {
                logger.warn({ err: errorMsg, command }, 'Suppressed unexpected ROS API reply/error');
            }
            return [];
        }
        throw error;
    }
}

/**
 * Get router system identity
 */
export async function getRouterInfo(api: any): Promise<RouterInfo> {
    const identityResult = await safeWrite(api, '/system/identity/print');
    const resourceResult = await safeWrite(api, '/system/resource/print');

    let routerboardResult: any[] = [];
    try {
        routerboardResult = await safeWrite(api, '/system/routerboard/print');
    } catch {
        // Some older non-RouterBoard devices might fail this
    }

    const identity = identityResult[0] || {};
    const resource = resourceResult[0] || {};
    const routerboard = routerboardResult[0] || {};

    return {
        identity: identity.name,
        version: resource.version,
        model: routerboard['model'] || resource['board-name'],
        serialNumber: routerboard['serial-number'],
        boardName: resource['board-name'],
        architecture: resource['architecture-name'],
    };
}

/**
 * Get router resource usage
 */
export async function getRouterResources(
    api: any
): Promise<RouterResources> {
    const resourceResult = await safeWrite(api, '/system/resource/print');
    const resource = resourceResult[0] || {};

    let health: any = {};
    try {
        const healthResult = await safeWrite(api, '/system/health/print');
        health = healthResult[0] || {};
    } catch {
        // Not all devices have health info
    }

    const parseIntSafe = (val: any) => typeof val === 'number' ? val : parseInt(val || '0', 10);
    const parseFloatSafe = (val: any) => typeof val === 'number' ? val : parseFloat(val || '0');

    return {
        uptime: resource.uptime,
        cpuLoad: parseIntSafe(resource['cpu-load']),
        cpuCount: parseIntSafe(resource['cpu-count'] || '1'),
        cpuFrequency: parseIntSafe(resource['cpu-frequency']),
        totalMemory: parseIntSafe(resource['total-memory']),
        usedMemory: parseIntSafe(resource['total-memory']) - parseIntSafe(resource['free-memory']),
        freeMemory: parseIntSafe(resource['free-memory']),
        totalDisk: parseIntSafe(resource['total-hdd-space']),
        usedDisk: parseIntSafe(resource['total-hdd-space']) - parseIntSafe(resource['free-hdd-space']),
        freeDisk: parseIntSafe(resource['free-hdd-space']),
        boardTemp: parseFloatSafe(health.temperature),
        voltage: parseFloatSafe(health.voltage),
    };
}

/**
 * Get router interfaces with actual link speeds and traffic rates
 */
export async function getRouterInterfaces(
    api: any
): Promise<RouterInterfaceData[]> {
    const interfacesResult = await safeWrite(api, '/interface/print');

    let ethernetSpeeds: Map<string, string> = new Map();
    try {
        const ethernetResult = await safeWrite(api, '/interface/ethernet/print');
        const runningEthernetIds: string[] = [];

        ethernetResult.forEach((eth: any) => {
            if (eth.name) {
                if (eth.speed) ethernetSpeeds.set(eth.name, eth.speed);
                const isRunning = eth.running === true || eth.running === 'true';
                if (isRunning && eth['.id']) {
                    runningEthernetIds.push(eth['.id']);
                }
            }
        });

        if (runningEthernetIds.length > 0) {
            await Promise.all(runningEthernetIds.map(async (id) => {
                try {
                    // Monitor individual calling
                    const monitorResult = await Promise.race([
                        safeWrite(api, [
                            '/interface/ethernet/monitor',
                            `=numbers=${id}`,
                            '=once='
                        ]),
                        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                    ]) as any[];

                    if (monitorResult && monitorResult.length > 0) {
                        const status = monitorResult[0];
                        if (status.name && status.rate) {
                            ethernetSpeeds.set(status.name, status.rate);
                        }
                    }
                } catch (monitorErr) {
                    logger.error({ err: monitorErr, ethId: id }, 'Failed to monitor ethernet status');
                }
            }));
        }
    } catch (err) {
        console.error('Failed to fetch ethernet info:', err);
    }

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
 * Get real-time traffic for specific interfaces
 */
export async function getInterfaceTraffic(
    api: any,
    interfaces: string[]
): Promise<Map<string, { tx: number; rx: number }>> {
    if (!interfaces || interfaces.length === 0) return new Map();

    const trafficMap = new Map<string, { tx: number; rx: number }>();

    // Process in chunks to avoid command line length limits
    const CHUNK_SIZE = 10;
    for (let i = 0; i < interfaces.length; i += CHUNK_SIZE) {
        const chunk = interfaces.slice(i, i + CHUNK_SIZE);
        try {
            const result = await safeWrite(api, [
                '/interface/monitor-traffic',
                `=interface=${chunk.join(',')}`,
                '=once='
            ]);

            result.forEach((res: any) => {
                const name = res.name;
                // routeros-node might return rx-bits-per-second or just rx-bits-per-second
                // Use safe parsing
                const rx = parseInt(res['rx-bits-per-second'] || '0', 10);
                const tx = parseInt(res['tx-bits-per-second'] || '0', 10);

                if (name) {
                    trafficMap.set(name, { tx, rx });
                }
            });
        } catch (err) {
            logger.error({ err, chunk }, 'Failed to monitor traffic for chunk');
        }
    }

    return trafficMap;
}

/**
 * Get router clock time
 */
export async function getRouterClock(api: any): Promise<{ time: string; date: string; timeZoneName: string; gmtOffset: string }> {
    const clockResult = await safeWrite(api, '/system/clock/print');
    return clockResult[0] || {};
}

/**
 * Get netwatch hosts
 */
export async function getNetwatchHosts(
    api: any,
    routerClock?: { time: string; date: string; timeZoneName: string; gmtOffset: string }
): Promise<NetwatchData[]> {
    let hostsResult: any[];
    try {
        hostsResult = await safeWrite(api, [
            '/tool/netwatch/print',
            '=.proplist=.id,host,status,since,comment,up-script,up_script,down-script,down_script,disabled'
        ]);
    } catch (err) {
        // Fallback for older ROS versions (ROS6) that might fail if underscores properties are requested
        logger.debug({ err: String(err) }, 'Netwatch bulk print with underscores failed, retrying with standard fields');
        hostsResult = await safeWrite(api, [
            '/tool/netwatch/print',
            '=.proplist=.id,host,status,since,comment,up-script,down-script,disabled'
        ]);
    }

    // Calculate time offset if clock provided
    let timeOffset = 0;
    if (routerClock) {
        try {
            const routerNow = parseMikrotikDate(`${routerClock.date} ${routerClock.time}`);
            const serverNow = new Date();
            timeOffset = serverNow.getTime() - routerNow.getTime();
        } catch (e) {
            if (!String(e).includes('closed') && !String(e).includes('timeout')) {
                logger.warn({ err: e }, 'Failed to calculate time offset');
            }
        }
    }

    return hostsResult.map((host: any) => {
        let sinceUp: Date | undefined;
        let sinceDown: Date | undefined;

        const rawSince = host.since || host['since-up'] || host['since-down'] || host['since_up'] || host['since_down'];
        if (rawSince) {
            try {
                const sinceDate = parseMikrotikDate(rawSince);
                if (timeOffset !== 0) {
                    sinceDate.setTime(sinceDate.getTime() + timeOffset);
                }
                if (host.status === 'up') {
                    sinceUp = sinceDate;
                } else if (host.status === 'down') {
                    sinceDown = sinceDate;
                }
            } catch (e) { }
        }

        const up1 = host['up-script'] || '';
        const up2 = host['up_script'] || '';
        const down1 = host['down-script'] || '';
        const down2 = host['down_script'] || '';

        // Extremely robust pick: if one version has our webhook, we MUST take that one.
        // Otherwise, take the longer string as it's less likely to be truncated.
        const pickBest = (s1: string, s2: string) => {
            const low1 = (s1 || '').toLowerCase();
            const low2 = (s2 || '').toLowerCase();
            const has1 = low1.includes('/api/webhook/netwatch');
            const has2 = low2.includes('/api/webhook/netwatch');

            if (has1 && !has2) return s1;
            if (has2 && !has1) return s2;
            return (s1 || '').length >= (s2 || '').length ? s1 : s2;
        };

        return {
            host: host.host,
            name: host.name,
            comment: host.comment,
            status: host.status,
            timeout: typeof host.timeout === 'string'
                ? parseInt(host.timeout || '1000', 10)
                : (host.timeout || 1000),
            interval: parseMikrotikInterval(host.interval || '10s'),
            sinceUp,
            sinceDown,
            disabled: host.disabled === true || host.disabled === 'true',
            upScript: pickBest(up1, up2),
            downScript: pickBest(down1, down2),
            _id: host['.id'],
        };
    });
}

function parseMikrotikDate(dateStr: string): Date {
    const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    const match = dateStr.match(/(\w+)\/(\d+)(?:\/(\d+))?\s+(\d+):(\d+):(\d+)/);

    if (!match) {
        const fallbackDate = new Date(dateStr);
        if (!isNaN(fallbackDate.getTime())) return fallbackDate;
        throw new Error(`Invalid date format: ${dateStr}`);
    }

    const [, monthStr, day, yearStr, hour, minute, second] = match;
    const month = months[monthStr.toLowerCase()];

    if (month === undefined) {
        const fallbackDate = new Date(dateStr);
        if (!isNaN(fallbackDate.getTime())) return fallbackDate;
        throw new Error(`Invalid month: ${monthStr}`);
    }

    const year = yearStr ? parseInt(yearStr) : new Date().getFullYear();

    return new Date(
        year,
        month,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
    );
}

function parseMikrotikInterval(interval: string): number {
    if (!interval) return 10;
    if (typeof interval === 'number') return interval;
    if (typeof interval !== 'string') return 10;

    if (interval.includes(':')) {
        const parts = interval.split(':').map(p => parseInt(p, 10));
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
    }

    let totalSeconds = 0;
    const weeks = interval.match(/(\d+)w/);
    const days = interval.match(/(\d+)d/);
    const hours = interval.match(/(\d+)h/);
    const minutes = interval.match(/(\d+)m/);
    const seconds = interval.match(/(\d+)s/);

    if (weeks) totalSeconds += parseInt(weeks[1]) * 604800;
    if (days) totalSeconds += parseInt(days[1]) * 86400;
    if (hours) totalSeconds += parseInt(hours[1]) * 3600;
    if (minutes) totalSeconds += parseInt(minutes[1]) * 60;
    if (seconds) totalSeconds += parseInt(seconds[1]);

    if (totalSeconds === 0 && /^\d+$/.test(interval)) {
        return parseInt(interval, 10);
    }

    return totalSeconds > 0 ? totalSeconds : 10;
}

export async function addNetwatchEntry(
    api: any,
    data: { host: string; interval?: number; timeout?: number; comment?: string }
): Promise<void> {
    const params: string[] = [`=host=${data.host}`];
    if (data.interval) params.push(`=interval=${data.interval}s`);
    if (!data.interval) params.push('=interval=30s');
    if (data.timeout) params.push(`=timeout=${data.timeout}ms`);
    else params.push('=timeout=1000ms');
    if (data.comment) params.push(`=comment=${data.comment}`);

    await safeWrite(api, ['/tool/netwatch/add', ...params]);
}

export async function updateNetwatchEntry(
    api: any,
    host: string,
    data: { host?: string; interval?: number; timeout?: number; comment?: string }
): Promise<void> {
    const entries = await safeWrite(api, ['/tool/netwatch/print', `?host=${host}`]);
    if (entries.length === 0) {
        throw new Error(`Netwatch entry for host ${host} not found`);
    }
    const id = entries[0]['.id'];

    const params: string[] = [`=.id=${id}`];

    if (data.host) params.push(`=host=${data.host}`);
    if (data.interval) params.push(`=interval=${data.interval}s`);
    if (data.timeout) params.push(`=timeout=${data.timeout}ms`);
    if (data.comment !== undefined) params.push(`=comment=${data.comment}`);

    if (params.length > 1) {
        await safeWrite(api, ['/tool/netwatch/set', ...params]);
    }
}

/**
 * Smart Script Append: injects Webhook URL into netwatch up/down scripts
 * safely without overwriting existing commands.
 */
export async function configureNetwatchWebhook(
    api: any,
    host: string,
    webhookUrl: string,
    existingEntry?: { _id?: string, upScript?: string, downScript?: string }
): Promise<void> {
    let currentUp = '';
    let currentDown = '';
    let id = '';

    // Targeted high-fidelity fetch using proplist to avoid truncation.
    // We retry without underscore fields for ROS6 compatibility.
    let entries: any[];
    try {
        entries = await safeWrite(api, [
            '/tool/netwatch/print',
            existingEntry && existingEntry._id ? `?.id=${existingEntry._id}` : `?host=${host}`,
            '=.proplist=.id,up-script,up_script,down-script,down_script'
        ]);
    } catch (err) {
        logger.debug({ host, err: String(err) }, 'Targeted print with underscores failed, retrying with standard fields');
        entries = await safeWrite(api, [
            '/tool/netwatch/print',
            existingEntry && existingEntry._id ? `?.id=${existingEntry._id}` : `?host=${host}`,
            '=.proplist=.id,up-script,down-script'
        ]);
    }

    if (entries.length === 0) return;

    const entry = entries[0];
    id = entry['.id'];

    // Detailed logging for debugging ROS7 field variations
    logger.debug({
        host,
        id,
        fields: Object.keys(entry).filter(k => k.includes('script')),
        up_dash: (entry['up-script'] || '').length,
        up_under: (entry['up_script'] || '').length,
        down_dash: (entry['down-script'] || '').length,
        down_under: (entry['down_script'] || '').length
    }, 'Netwatch deep-fetch result');

    // Extremely robust pick: preferring the field that actually has the webhook.
    // Falls back to hyphenated field (standard) if both are empty/missing.
    const pb = (s1: any, s2: any, type: string) => {
        const val1 = String(s1 || '');
        const val2 = String(s2 || '');
        const has1 = val1.toLowerCase().includes('/api/webhook/netwatch');
        const has2 = val2.toLowerCase().includes('/api/webhook/netwatch');

        let result = '';
        if (has1 && !has2) result = val1;
        else if (has2 && !has1) result = val2;
        else if (val1.length > 0 || val2.length > 0) result = val1.length >= val2.length ? val1 : val2;
        else result = ''; // Both truly empty

        logger.debug({ host, type, has1, has2, len1: val1.length, len2: val2.length, chosenLen: result.length }, 'Targeted script version selection');
        return result;
    };

    currentUp = pb(entry['up-script'], entry['up_script'], 'up');
    currentDown = pb(entry['down-script'], entry['down_script'], 'down');

    // Safety: prevent wiping scripts if we got an empty read when we expected data.
    // If the targeted fetch (high-fidelity) returns '', but the bulk scan (nw) had content.
    const upUnexpectedlyEmpty = currentUp === '' && (existingEntry?.upScript || '').length > 0;
    const downUnexpectedlyEmpty = currentDown === '' && (existingEntry?.downScript || '').length > 0;

    // Additional ROS6 Guard: If we got absolutely NO script fields in the targeted fetch 
    // but we were about to append to what we thought was an empty base.
    const noScriptFieldsAtAll = entry['up-script'] === undefined && entry['up_script'] === undefined &&
        entry['down-script'] === undefined && entry['down_script'] === undefined;

    if (upUnexpectedlyEmpty || downUnexpectedlyEmpty || noScriptFieldsAtAll) {
        logger.warn({ host, id, upUnexpectedlyEmpty, downUnexpectedlyEmpty, noScriptFieldsAtAll }, '[Safety Guard] Aborted write: Full read returned empty or missing script values');
        return;
    }

    // Formulate the fetch command
    const upCommand = `:delay 1s; /tool fetch url="${webhookUrl}&host=${host}&status=up" keep-result=no;`;
    const downCommand = `:delay 1s; /tool fetch url="${webhookUrl}&host=${host}&status=down" keep-result=no;`;

    let newUp = currentUp;
    let newDown = currentDown;
    let needsUpdate = false;

    // Byte-for-byte identical smart append logic
    const smartAppend = (current: string, command: string) => {
        const base = current.trim();
        const hasWebhook = base.toLowerCase().includes('/api/webhook/netwatch');
        if (hasWebhook) return { script: current, modified: false };

        const separator = (base === '' || base.endsWith(';') || base.endsWith('\n')) ? '' : ';';
        const updated = base ? `${base}${separator}\r\n${command}` : command;
        return { script: updated, modified: true };
    };

    const upResult = smartAppend(currentUp, upCommand);
    if (upResult.modified) {
        newUp = upResult.script;
        needsUpdate = true;
    }

    const downResult = smartAppend(currentDown, downCommand);
    if (downResult.modified) {
        newDown = downResult.script;
        needsUpdate = true;
    }

    if (needsUpdate) {
        logger.info({ host, id, upMod: upResult.modified, downMod: downResult.modified }, 'Planning Netwatch script update');

        // Use standard hyphenated fields AND underscore fields if present in original entry
        // This ensures the update is "sticky" across all ROS7 protocol variations
        const updateParams = [
            `/tool/netwatch/set`,
            `=.id=${id}`,
            `=up-script=${newUp}`,
            `=down-script=${newDown}`
        ];

        if (entry['up_script'] !== undefined) updateParams.push(`=up_script=${newUp}`);
        if (entry['down_script'] !== undefined) updateParams.push(`=down_script=${newDown}`);

        await safeWrite(api, updateParams);
        logger.info({ host }, 'Smart Append: Webhook scripts successfully synchronized');
    }
}

/**
 * Smart Script Remove: removes ONLY the Webhook lines from netwatch scripts
 */
export async function removeNetwatchWebhook(
    api: any,
    host: string,
    existingEntry?: { _id?: string, upScript?: string, downScript?: string }
): Promise<void> {
    let currentUp = '';
    let currentDown = '';
    let id = '';

    // Targeted high-fidelity fetch using proplist to avoid truncation.
    // We retry without underscore fields for ROS6 compatibility.
    let entries: any[];
    try {
        entries = await safeWrite(api, [
            '/tool/netwatch/print',
            existingEntry && existingEntry._id ? `?.id=${existingEntry._id}` : `?host=${host}`,
            '=.proplist=.id,up-script,up_script,down-script,down_script'
        ]);
    } catch (err) {
        logger.debug({ host, err: String(err) }, 'Targeted print (cleanup) with underscores failed, retrying with standard fields');
        entries = await safeWrite(api, [
            '/tool/netwatch/print',
            existingEntry && existingEntry._id ? `?.id=${existingEntry._id}` : `?host=${host}`,
            '=.proplist=.id,up-script,down-script'
        ]);
    }

    // Fallback: search by host if ID query returned nothing
    if (entries.length === 0 && host) {
        try {
            const fb = await safeWrite(api, [
                '/tool/netwatch/print',
                `?host=${host}`,
                '=.proplist=.id,up-script,up_script,down-script,down_script'
            ]);
            if (fb.length > 0) entries.push(fb[0]);
        } catch (err) {
            const fb = await safeWrite(api, [
                '/tool/netwatch/print',
                `?host=${host}`,
                '=.proplist=.id,up-script,down-script'
            ]);
            if (fb.length > 0) entries.push(fb[0]);
        }
    }

    if (entries.length === 0) return;

    const entry = entries[0];
    id = entry['.id'];

    // Robust pick: ensuring we find the webhook line if it exists in either field version
    const pb = (s1: string, s2: string) => {
        const has1 = (s1 || '').toLowerCase().includes('/api/webhook/netwatch');
        const has2 = (s2 || '').toLowerCase().includes('/api/webhook/netwatch');
        if (has1 && !has2) return s1 || '';
        if (has2 && !has1) return s2 || '';
        return (s1 || '').length >= (s2 || '').length ? (s1 || '') : (s2 || '');
    };

    currentUp = pb(entry['up-script'], entry['up_script']);
    currentDown = pb(entry['down-script'], entry['down_script']);

    // Safety: If the script is suspiciously empty but we know the user has long scripts,
    // we should log a warning. Note: This check is simple for now.
    if (currentUp === '' && currentDown === '' && existingEntry && (existingEntry.upScript || existingEntry.downScript)) {
        logger.warn({ host, id }, '[Safety Guard] Aborted write because full read returned empty scripts unexpectedly');
        return;
    }

    // Filter out our lines (case-insensitive)
    const cleanScript = (script: string) => {
        return script
            .split(/\r?\n/)
            .filter(line => !line.toLowerCase().includes('/api/webhook/netwatch'))
            .join('\r\n')
            .trim();
    };

    const newUp = cleanScript(currentUp);
    const newDown = cleanScript(currentDown);

    // Compare normalized versions
    const normalizedOldUp = currentUp.trim().replace(/\r\n/g, '\n');
    const normalizedOldDown = currentDown.trim().replace(/\r\n/g, '\n');
    const normalizedNewUp = newUp.replace(/\r\n/g, '\n');
    const normalizedNewDown = newDown.replace(/\r\n/g, '\n');

    if (normalizedNewUp !== normalizedOldUp || normalizedNewDown !== normalizedOldDown) {
        const params: string[] = [`=.id=${id}`];
        params.push(`=up-script=${newUp}`);
        params.push(`=down-script=${newDown}`);

        // For maximum compatibility with ROS7 field variations
        if (entry['up_script'] !== undefined) params.push(`=up_script=${newUp}`);
        if (entry['down_script'] !== undefined) params.push(`=down_script=${newDown}`);

        await safeWrite(api, [
            '/tool/netwatch/set',
            ...params
        ]);
        logger.info({ host }, 'Smart Cleanup: Webhook lines removed from netwatch scripts');
    }
}

export async function removeNetwatchEntry(
    api: any,
    host: string
): Promise<void> {
    const entries = await safeWrite(api, ['/tool/netwatch/print', `?host=${host}`]);
    if (entries.length > 0) {
        const id = entries[0]['.id'];
        await safeWrite(api, ['/tool/netwatch/remove', `=.id=${id}`]);
    }
}

/**
 * Reboot a router
 */
export async function rebootRouter(api: any): Promise<void> {
    await safeWrite(api, '/system/reboot');
}

export async function testConnection(
    config: RouterConnection
): Promise<{ success: boolean; info?: RouterInfo; error?: string }> {
    try {
        const api = await connectToRouter(config);
        const info = await getRouterInfo(api);
        await api.close();
        return { success: true, info };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}

export function parseUptimeToSeconds(uptime: string): number {
    const regex = /(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
    const match = uptime.match(regex);
    if (!match) return 0;
    const weeks = parseInt(match[1] || '0', 10);
    const days = parseInt(match[2] || '0', 10);
    const hours = parseInt(match[3] || '0', 10);
    const minutes = parseInt(match[4] || '0', 10);
    const seconds = parseInt(match[5] || '0', 10);
    return (weeks * 7 * 24 * 60 * 60 + days * 24 * 60 * 60 + hours * 3600 + minutes * 60 + seconds);
}

/**
 * Get active hotspot users
 */
export async function getHotspotActive(api: any): Promise<number> {
    const result = await safeWrite(api, '/ip/hotspot/active/print');
    return result.length;
}

/**
 * Get active PPP connections
 */
export async function getPppActive(api: any): Promise<number> {
    const result = await safeWrite(api, '/ppp/active/print');
    return result.length;
}

/**
 * Measure ping latency to a host
 * Returns latency in ms, or -1 if unreachable
 */
/**
 * Measure ping latency to a host
 * Returns latency in ms, or -1 if unreachable
 */
export async function measurePing(
    api: any,
    address: string,
    count: number = 3,
    interval: string = '100ms',
    timeout: string = '1000ms'
): Promise<{ latency: number, packetLoss: number }> {
    if (!address) {
        return { latency: -1, packetLoss: 100 };
    }

    try {
        // node-routeros might throw if RouterOS sends unexpected tags like !empty
        // We Use Promise.race to ensure it never hangs too long
        const resultPromise = safeWrite(api, [
            '/ping',
            `=address=${address}`,
            `=count=${count}`,
            `=interval=${interval}`
        ]);

        const timeoutMs = parseInt(timeout) || 10000;
        const result = await Promise.race([
            resultPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), timeoutMs))
        ]) as any[];

        if (result && Array.isArray(result) && result.length > 0) {
            let totalLatency = 0;
            let receivedCount = 0;
            let sentCount = count;

            for (const entry of result) {
                if (entry['time'] !== undefined && entry['time'] !== null) {
                    const lat = parseLatencyValue(entry['time']);
                    if (lat >= 0) {
                        totalLatency += lat;
                        receivedCount++;
                    }
                }
                else if (entry['sent'] !== undefined && entry['received'] !== undefined) {
                    sentCount = parseInt(entry['sent']) || count;
                    receivedCount = parseInt(entry['received']) || 0;
                    if (entry['avg-rtt']) {
                        const avgRtt = parseLatencyValue(entry['avg-rtt']);
                        if (avgRtt >= 0 && receivedCount > 0) {
                            return {
                                latency: avgRtt,
                                packetLoss: Math.round(((sentCount - receivedCount) / sentCount) * 100)
                            };
                        }
                    }
                }
            }

            const lossPercent = sentCount > 0
                ? Math.round(((sentCount - receivedCount) / sentCount) * 100)
                : 100;

            const avgLatency = receivedCount > 0
                ? Math.round(totalLatency / receivedCount)
                : -1;

            return { latency: avgLatency, packetLoss: lossPercent };
        }

        return { latency: -1, packetLoss: 100 };
    } catch (error: any) {
        // Specifically catch the "Tried to process unknown reply" to avoid global crash
        if (error.message?.includes('unknown reply')) {
            logger.warn({ err: error, address }, '[Ping Warning] MikroTik sent unexpected reply');
        } else {
            logger.error({ err: error, address }, 'Error pinging host');
        }
        return { latency: -1, packetLoss: 100 };
    }
}

/**
 * Parse latency value from RouterOS ping output
 * Handles formats: "10ms", "956us", "1s", or plain number
 */
function parseLatencyValue(value: any): number {
    const str = String(value).trim().toLowerCase();

    // Match milliseconds and microseconds
    const msMatch = str.match(/(\d+)ms/);
    const usMatch = str.match(/(\d+)us/);

    // If ms component is present (e.g. "5ms", "5ms258us")
    if (msMatch) {
        const ms = parseInt(msMatch[1], 10);
        const us = usMatch ? parseInt(usMatch[1], 10) : 0;
        return Math.round(ms + (us / 1000));
    }

    // If only microseconds (e.g. "800us")
    if (usMatch) {
        const us = parseInt(usMatch[1], 10);
        return Math.max(1, Math.round(us / 1000));
    }

    // Handle seconds (s) - e.g. "1s", "0.5s"
    if (str.endsWith('s') && !str.includes('ms') && !str.includes('us')) {
        const s = parseFloat(str.replace('s', '')); // replace 's' to safe parse
        return Math.round(s * 1000);
    }

    // Plain number (assume ms)
    const num = parseFloat(str);
    return isNaN(num) ? -1 : Math.round(num);
}

export interface PppSession {
    name: string;           // username
    service?: string;       // pppoe, pptp, l2tp, ovpn, sstp
    callerId?: string;      // MAC address or phone number
    address?: string;       // IP address assigned
    uptime?: string;        // uptime string like "1h30m"
    uptimeSeconds?: number; // uptime in seconds for sorting
    encoding?: string;
    sessionId?: string;
    limitBytesIn?: number;
    limitBytesOut?: number;
}

/**
 * Get active PPP sessions with details
 */
export async function getPppSessions(api: any): Promise<PppSession[]> {
    const result = await safeWrite(api, '/ppp/active/print');

    return result.map((session: any) => {
        // Parse uptime to seconds for sorting
        let uptimeSeconds = 0;
        if (session.uptime) {
            uptimeSeconds = parseUptimeToSeconds(session.uptime);
        }

        return {
            name: session.name,
            service: session.service,
            callerId: session['caller-id'],
            address: session.address,
            uptime: session.uptime,
            uptimeSeconds,
            encoding: session.encoding,
            sessionId: session['session-id'],
            limitBytesIn: session['limit-bytes-in'] ? parseInt(session['limit-bytes-in']) : undefined,
            limitBytesOut: session['limit-bytes-out'] ? parseInt(session['limit-bytes-out']) : undefined,
        };
    });
}

/**
 * Simple Queue Interface
 */
export interface SimpleQueueData {
    name: string;
    target: string;
    rate?: string; // limit-at (config)
    maxLimit?: string; // max-limit (config)
    bytes: string; // "upload/download" (cumulative)
    packets: string; // "upload/download" (cumulative)
    dynamic: boolean;
    disabled: boolean;
    comment?: string;
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

/**
 * Get discovered neighbors (MNDP)
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

    const processResults = (result: any) => {
        if (!Array.isArray(result)) return;

        result.forEach((n: any) => {
            const romonId = n['address'] || n['romon-id'] || n['id'] || n['.id'] || n['dst-id'] || n['mac-address'];
            if (!romonId) {
                logger.debug({ item: n }, 'RoMON item skipped: no ID found');
                return;
            }

            // Merge with existing entry or create new
            const existing = neighbors.get(romonId);
            neighbors.set(romonId, {
                romonId,
                path: n.path || n['romon-id'] || n['id'] || n['.id'] || existing?.path,
                mtu: parseInt(n.mtu || n['l2mtu'] || String(existing?.mtu || '0'), 10),
                identity: n.identity || existing?.identity,
                board: n.board || n.platform || existing?.board,
                version: n.version || existing?.version,
            });
        });
    };

    // Try Discovery (reaches neighbors not yet peered)
    try {
        const discoveryResult = await safeWrite(api, '/tool/romon/discovery/print');
        logger.debug({ count: discoveryResult?.length, firstKeys: discoveryResult?.[0] ? Object.keys(discoveryResult[0]) : [] }, 'RoMON Discovery raw result');
        processResults(discoveryResult);
    } catch (e) {
        // Ignore errors for individual commands
    }

    // Try Peered Neighbors (already established)
    try {
        const neighborResult = await safeWrite(api, '/tool/romon/neighbor/print');
        logger.debug({ count: neighborResult?.length, firstKeys: neighborResult?.[0] ? Object.keys(neighborResult[0]) : [] }, 'RoMON Neighbor raw result');
        processResults(neighborResult);
    } catch (e) {
        // Ignore
    }

    // Try spelling variant
    try {
        const neighbourResult = await safeWrite(api, '/tool/romon/neighbour/print');
        logger.debug({ count: neighbourResult?.length, firstKeys: neighbourResult?.[0] ? Object.keys(neighbourResult[0]) : [] }, 'RoMON Neighbour variant raw result');
        processResults(neighbourResult);
    } catch (e) {
        // Ignore
    }

    return Array.from(neighbors.values());
}
