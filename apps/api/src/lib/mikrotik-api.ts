import nodeRouteros from 'node-routeros';
const { RouterOSAPI } = nodeRouteros;

export interface RouterConnection {
    host: string;
    port: number;
    username: string;
    password: string;
    timeout?: number;
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
        timeout: config.timeout || 60,
        keepalive: true,
    });

    await api.connect();
    return api;
}

/**
 * Get router system identity
 */
export async function getRouterInfo(api: any): Promise<RouterInfo> {
    const identityResult = await api.write('/system/identity/print');
    const resourceResult = await api.write('/system/resource/print');

    let routerboardResult: any[] = [];
    try {
        routerboardResult = await api.write('/system/routerboard/print');
    } catch {
        // Not all devices have routerboard info
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
    const resourceResult = await api.write('/system/resource/print');
    const resource = resourceResult[0] || {};

    let health: any = {};
    try {
        const healthResult = await api.write('/system/health/print');
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
    const interfacesResult = await api.write('/interface/print');

    let ethernetSpeeds: Map<string, string> = new Map();
    try {
        const ethernetResult = await api.write('/interface/ethernet/print');
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
                        api.write([
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
                    console.error(`Failed to monitor ethernet status for ${id}:`, monitorErr instanceof Error ? monitorErr.message : monitorErr);
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
 * Get netwatch hosts
 */
export async function getNetwatchHosts(
    api: any
): Promise<NetwatchData[]> {
    const hostsResult = await api.write('/tool/netwatch/print');

    return hostsResult.map((host: any) => {
        let sinceUp: Date | undefined;
        let sinceDown: Date | undefined;

        if (host.since) {
            try {
                const sinceDate = parseMikrotikDate(host.since);
                if (host.status === 'up') {
                    sinceUp = sinceDate;
                } else if (host.status === 'down') {
                    sinceDown = sinceDate;
                }
            } catch (e) {
                // Ignore
            }
        }

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

    await api.write(['/tool/netwatch/add', ...params]);
}

export async function updateNetwatchEntry(
    api: any,
    host: string,
    data: { host?: string; interval?: number; timeout?: number; comment?: string }
): Promise<void> {
    const entries = await api.write(['/tool/netwatch/print', `?host=${host}`]);
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
        await api.write(['/tool/netwatch/set', ...params]);
    }
}

export async function removeNetwatchEntry(
    api: any,
    host: string
): Promise<void> {
    const entries = await api.write(['/tool/netwatch/print', `?host=${host}`]);
    if (entries.length > 0) {
        const id = entries[0]['.id'];
        await api.write(['/tool/netwatch/remove', `=.id=${id}`]);
    }
}

export async function rebootRouter(api: any): Promise<void> {
    await api.write('/system/reboot');
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
    const result = await api.write('/ip/hotspot/active/print');
    return result.length;
}

/**
 * Get active PPP connections
 */
export async function getPppActive(api: any): Promise<number> {
    const result = await api.write('/ppp/active/print');
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
export async function measurePing(api: any, address: string): Promise<number> {
    try {
        const result = await api.write([
            '/ping',
            `=address=${address}`,
            '=count=3' // Increase to 3 for better average
        ]);

        // console.log(`[DEBUG] Ping raw for ${address}:`, JSON.stringify(result));

        if (result && result.length > 0) {
            // Filter out packets that were lost (sometimes they appear in list)
            // But usually result is summary of each packet. 
            // We want the average of successful packets.

            let totalLatency = 0;
            let count = 0;

            for (const entry of result) {
                // Ignore summary entries if any (usually ping tool returns per-packet or final summary depending on flags)
                // api.write usually returns array of responses.

                // Prioritize avg-rtt if available (usually in final summary or each packet)
                if (entry['avg-rtt']) {
                    return parseLatencyValue(entry['avg-rtt']);
                }

                // If per-packet 'time' is available
                if (entry['time']) {
                    const lat = parseLatencyValue(entry['time']);
                    if (lat >= 0) {
                        totalLatency += lat;
                        count++;
                    }
                }
            }

            if (count > 0) {
                const avg = Math.round(totalLatency / count);
                // console.log(`[DEBUG] Calculated average for ${address}: ${avg}ms from ${count} packets`);
                return avg;
            }
        }
        return -1;
    } catch (error) {
        // Ping failed (timeout or other error)
        console.error(`Error pinging ${address}:`, error);
        return -1;
    }
}

/**
 * Parse latency value from RouterOS ping output
 * Handles formats: "10ms", "956us", "1s", or plain number
 */
function parseLatencyValue(value: any): number {
    const str = String(value).trim().toLowerCase();

    // Handle microseconds (us) - convert to ms
    if (str.includes('us')) {
        const us = parseFloat(str.replace('us', ''));
        return Math.max(1, Math.round(us / 1000)); // Min 1ms
    }

    // Handle seconds (s) - NOT "ms"
    if (str.endsWith('s') && !str.includes('ms')) {
        const s = parseFloat(str.replace('s', ''));
        return Math.round(s * 1000);
    }

    // Handle milliseconds (ms)
    if (str.includes('ms')) {
        return Math.round(parseFloat(str.replace('ms', '')));
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
    const result = await api.write('/ppp/active/print');

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

