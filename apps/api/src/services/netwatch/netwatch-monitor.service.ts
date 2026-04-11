import { eq, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, routerNetwatch, devicePerformanceHistory, onus } from '../../db/schema/index.js';
import { measurePing, getInterfaceTraffic } from '../../lib/mikrotik-api.js';
import { alertService } from '../alert.service.js';
import { dashboardService } from '../dashboard.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Measure latency for netwatch targets
 */
export async function measureLatency(routerId: string, routerName: string, conn: any, targets: any[], tx: any = db): Promise<void> {
    const totalNetwatch = await tx.select({ count: count() }).from(routerNetwatch).then((res: any) => res[0]?.count || 0);
    let concurrencyLimit = totalNetwatch > 500 ? 5 : (totalNetwatch > 200 ? 10 : (totalNetwatch > 50 ? 15 : 20));

    for (let i = 0; i < targets.length; i += concurrencyLimit) {
        const chunk = targets.slice(i, i + concurrencyLimit);
        await Promise.all(chunk.map(async (target) => {
            try {
                if (target.name?.includes('[DISABLED]')) return;
                const isPingable = target.host && target.host !== '' && target.host !== '0.0.0.0' && target.deviceType !== 'odp';
                
                if (!isPingable) {
                    await tx.update(routerNetwatch).set({ status: 'up', latency: null, packetLoss: 0, updatedAt: new Date() }).where(eq(routerNetwatch.id, target.id));
                    await alertService.resolvePerformanceAlert(routerId, target.host, undefined, tx);
                    return;
                }

                let measurement = await measurePing(conn, target.host, 2, '300ms', '5000ms');

                // Retry once if it was a connection-related failure
                if (!measurement.latency || measurement.latency < 0) {
                    const errorMsg = String(measurement.error || '').toLowerCase();
                    if (errorMsg.includes('closed') || errorMsg.includes('check') || errorMsg.includes('reset')) {
                        await new Promise(r => setTimeout(r, 500));
                        measurement = await measurePing(conn, target.host, 2, '300ms', '5000ms');
                    }
                }

                const { latency, packetLoss, error: pingError } = measurement;

                if (latency >= 0) {
                    const updateData: any = { latency, lastKnownLatency: latency, packetLoss, updatedAt: new Date() };
                    if (target.isAppOnly) { updateData.status = 'up'; updateData.lastUp = new Date(); }
                    await tx.update(routerNetwatch).set(updateData).where(eq(routerNetwatch.id, target.id));

                    let derivedTenantId = target.tenantId;
                    if (!derivedTenantId || derivedTenantId.trim() === '') {
                        const [parentRouter] = await tx.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, target.routerId));
                        derivedTenantId = parentRouter?.tenantId || null;
                    }

                    await tx.insert(devicePerformanceHistory).values({
                        tenantId: derivedTenantId || sql`NULL`, routerId: target.routerId, host: target.host,
                        onuId: target.linkedOnuId || (await (async () => {
                            const match = await tx.query.onus.findFirst({
                                where: (onus: any, { or, eq, and, ilike }: any) => or(eq(onus.host, target.host), and(eq(onus.routerId, target.routerId), ilike(onus.name, target.name || '')))
                            });
                            return match?.id || null;
                        })()),
                        latency, recordedAt: new Date()
                    });

                    if (latency > 100 || packetLoss > 0) {
                        await alertService.createPerformanceAlert(routerId, routerName, target.host, target.name || target.host, latency, packetLoss, target.status === 'unknown' ? 'up' : target.status, tx);
                    } else await alertService.resolvePerformanceAlert(routerId, target.host, undefined, tx);
                } else {
                    const updateData: any = { latency: null, packetLoss: packetLoss >= 0 ? packetLoss : null, updatedAt: new Date() };
                    if (target.isAppOnly) { updateData.status = 'down'; updateData.lastDown = new Date(); }
                    await tx.update(routerNetwatch).set(updateData).where(eq(routerNetwatch.id, target.id));

                    let derivedTenantId = target.tenantId;
                    if (!derivedTenantId || derivedTenantId.trim() === '') {
                        const [parentRouter] = await tx.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, target.routerId));
                        derivedTenantId = parentRouter?.tenantId || null;
                    }

                    await tx.insert(devicePerformanceHistory).values({
                        tenantId: derivedTenantId || sql`NULL`, routerId: target.routerId, host: target.host,
                        onuId: target.linkedOnuId || (await (async () => {
                             const match = await tx.query.onus.findFirst({
                                where: (onus: any, { or, eq, and, ilike }: any) => or(eq(onus.host, target.host), and(eq(onus.routerId, target.routerId), ilike(onus.name, target.name || '')))
                            });
                            return match?.id || null;
                        })()),
                        latency: null, errorMessage: pingError || 'Unreachable', recordedAt: new Date()
                    });
                    if (packetLoss > 0) await alertService.createPerformanceAlert(routerId, routerName, target.host, target.name || target.host, 0, packetLoss, target.status === 'unknown' ? 'down' : target.status, tx);
                }
            } catch (e: any) { logger.warn({ err: e?.message || String(e), host: target.host }, 'Latency measure error'); }
        }));
    }
    
    // Invalidate dashboard stats cache because statuses may have changed
    dashboardService.invalidateCache();
}

/**
 * Propagate interface traffic to netwatch entries
 */
export async function propagateTraffic(routerId: string, routerName: string, conn: any, tx: any = db): Promise<void> {
    try {
        const entries = await tx.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, routerId));
        const entryMap = new Map(entries.map((e: any) => [e.id, e]));

        const resolveInterface = (entry: any, visited = new Set<string>()): string | null => {
            if (visited.has(entry.id)) return null;
            visited.add(entry.id);
            if (entry.targetInterface && entry.targetInterface.trim() !== '') return entry.targetInterface;
            if (entry.connectionType === 'client' && entry.connectedToId) {
                const parent = entryMap.get(entry.connectedToId);
                if (parent) return resolveInterface(parent, visited);
            }
            return null;
        };

        const interfaceSet = new Set<string>();
        const entryInterfaceMap = new Map<string, string>();

        for (const entry of entries) {
            const iface = resolveInterface(entry);
            if (iface) { interfaceSet.add(iface); entryInterfaceMap.set(entry.id, iface); }
        }

        const interfacesToFetch = [...interfaceSet];
        if (interfacesToFetch.length > 0) {
            const trafficMap = await getInterfaceTraffic(conn, interfacesToFetch);
            for (const entry of entries) {
                const resolvedIface = entryInterfaceMap.get(entry.id);
                if (resolvedIface) {
                    const stats = trafficMap.get(resolvedIface);
                    if (stats) {
                        await tx.update(routerNetwatch).set({ txRate: stats.tx, rxRate: stats.rx, updatedAt: new Date() }).where(eq(routerNetwatch.id, entry.id));
                    }
                }
            }
        }
    } catch (err: any) { logger.error({ err: err?.message || String(err), router: routerName }, 'Failed propagate traffic'); }
}
