import { connectToRouter, safeWrite } from './connection.js';
import { RouterInfo, RouterResources, RouterConnection } from './types.js';

/**
 * Get router system identity and info
 */
export async function getRouterInfo(api: any): Promise<RouterInfo> {
    const identityResult = await safeWrite(api, '/system/identity/print');
    const resourceResult = await safeWrite(api, '/system/resource/print');

    let routerboardResult: any[] = [];
    try {
        routerboardResult = await safeWrite(api, '/system/routerboard/print');
    } catch { /* ignore */ }

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
export async function getRouterResources(api: any): Promise<RouterResources> {
    const resourceResult = await safeWrite(api, '/system/resource/print');
    const resource = resourceResult[0] || {};

    let health: any = {};
    try {
        const healthResult = await safeWrite(api, '/system/health/print');
        health = healthResult[0] || {};
    } catch { /* ignore */ }

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
 * Get router clock time
 */
export async function getRouterClock(api: any): Promise<{ time: string; date: string; timeZoneName: string; gmtOffset: string }> {
    const clockResult = await safeWrite(api, '/system/clock/print');
    return clockResult[0] || {};
}

/**
 * Reboot a router
 */
export async function rebootRouter(api: any): Promise<void> {
    await safeWrite(api, '/system/reboot');
}

/**
 * Test connection with credentials
 */
export async function testConnection(
    config: RouterConnection
): Promise<{ success: boolean; info?: RouterInfo; error?: string }> {
    try {
        const api = await connectToRouter(config);
        const info = await getRouterInfo(api);
        // Do NOT release because it goes back to pool, but we want to close if it's a one-off test
        // Actually, the pool handles it. But for test, we might want to close immediately.
        await api.close(); 
        return { success: true, info };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
    }
}
