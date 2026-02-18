import { eq, and, isNotNull, or, sql, desc, getTableColumns, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routers,
    routerNetwatch,
    onus,
    olts,
    alerts,
    type RouterNetwatch,
} from '../db/schema/index.js';
import {
    getNetwatchHosts,
    measurePing,
    getInterfaceTraffic,
    getRouterClock,
    connectToRouter,
    type RouterConnection,
} from '../lib/mikrotik-api.js';
import { decrypt } from '../lib/encryption.js';
import { alertService } from './alert.service.js';
import { logger } from '../lib/logger.js';

export class RouterNetwatchService {
    /**
     * Get all netwatch entries for a router with detailed info (ONUs/Alerts)
     */
    async getNetwatch(routerId: string): Promise<any[]> {
        const entries = await db
            .select({
                ...getTableColumns(routerNetwatch),
                // Override coordinates with COALESCE (ONUS takes precedence)
                latitude: sql<string>`COALESCE(${onus.latitude}, ${routerNetwatch.latitude})`.as('latitude'),
                longitude: sql<string>`COALESCE(${onus.longitude}, ${routerNetwatch.longitude})`.as('longitude'),

                model: onus.model,
                ssid: onus.ssid,
                firmwareVersion: onus.firmwareVersion,
                sn: onus.sn,
                lastRxPower: onus.lastRxPower,
                physicalStatus: onus.status,
                discoverySources: onus.discoverySources,
                ponPort: onus.ponPort,
                onuIndex: onus.onuIndex,

                // Allow manual override if already linked via ID
                linkedOnuId: routerNetwatch.linkedOnuId,
                oltName: olts.name
            })
            .from(routerNetwatch)
            .leftJoin(onus, or(
                sql`TRIM(${routerNetwatch.host}) = TRIM(${onus.host})`,
                eq(routerNetwatch.linkedOnuId, onus.id)
            ))
            .leftJoin(olts, eq(onus.oltId, olts.id))
            .where(eq(routerNetwatch.routerId, routerId))
            .orderBy(routerNetwatch.host) as any;

        // Fetch recent 'netwatch_down' alerts to fix invalid MikroTik timestamps
        const downAlerts = await db
            .select({
                message: alerts.message,
                createdAt: alerts.createdAt,
            })
            .from(alerts)
            .where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, 'netwatch_down')
            ))
            .orderBy(desc(alerts.createdAt))
            .limit(500);

        return entries.map((entry: any) => {
            if (entry.status === 'down' && entry.host) {
                const matchingAlert = downAlerts.find(a =>
                    a.message && a.message.includes(entry.host)
                );

                if (matchingAlert) {
                    return {
                        ...entry,
                        lastDown: matchingAlert.createdAt,
                    };
                }
            }
            return entry;
        });
    }

    /**
     * UNIFIED LINKAGE: Get all netwatch entries for multiple routers in one batch
     */
    async getNetwatchAll(routerIds: string[]): Promise<any[]> {
        if (!routerIds || routerIds.length === 0) return [];

        return await db
            .select({
                ...getTableColumns(routerNetwatch),
                latitude: sql<string>`COALESCE(${onus.latitude}, ${routerNetwatch.latitude})`.as('latitude'),
                longitude: sql<string>`COALESCE(${onus.longitude}, ${routerNetwatch.longitude})`.as('longitude'),

                model: onus.model,
                ssid: onus.ssid,
                firmwareVersion: onus.firmwareVersion,
                sn: onus.sn,
                lastRxPower: onus.lastRxPower,
                physicalStatus: onus.status,
                discoverySources: onus.discoverySources,
                ponPort: onus.ponPort,
                onuIndex: onus.onuIndex,
                linkedOnuId: routerNetwatch.linkedOnuId,
                oltName: olts.name
            })
            .from(routerNetwatch)
            .leftJoin(onus, or(
                sql`TRIM(${routerNetwatch.host}) = TRIM(${onus.host})`,
                eq(routerNetwatch.linkedOnuId, onus.id)
            ))
            .leftJoin(olts, eq(onus.oltId, olts.id))
            .where(inArray(routerNetwatch.routerId, routerIds))
            .orderBy(routerNetwatch.host) as any;
    }

    /**
     * Sync and update hosts status from MikroTik (inside an existing connection)
     */
    async syncHosts(routerId: string, routerName: string, conn: any, availableInterfaces?: Set<string>): Promise<void> {
        try {
            const mikrotikNetwatch = await getNetwatchHosts(conn);

            const existingEntries = await db
                .select()
                .from(routerNetwatch)
                .where(eq(routerNetwatch.routerId, routerId));

            const existingMap = new Map(existingEntries.map(e => [e.host, e]));

            for (const nw of mikrotikNetwatch) {
                const existing = existingMap.get(nw.host);

                let status: 'up' | 'down' | 'unknown' = 'unknown';
                if (nw.status === 'up') status = 'up';
                else if (nw.status === 'down') status = 'down';

                const prefix = nw.disabled ? '[DISABLED] ' : '';
                let baseName = nw.comment || nw.name;
                if (!baseName && existing) {
                    baseName = existing.name?.replace(/^\[DISABLED\]\s*/, '') || '';
                }
                const finalName = prefix + (baseName || '');

                if (existing) {
                    if (existing.status !== status && existing.status !== 'unknown' && status !== 'unknown') {
                        if (status === 'down' || status === 'up') {
                            await alertService.createNetwatchAlert(
                                routerId,
                                `[${routerName}] ${finalName}`,
                                nw.host,
                                status
                            );
                        }
                    }

                    const updateData: any = {
                        name: finalName,
                        interval: nw.interval || existing.interval,
                        status: status,
                        lastCheck: new Date(),
                        lastUp: nw.sinceUp || existing.lastUp,
                        lastDown: nw.sinceDown || existing.lastDown,
                        updatedAt: new Date(),
                    };

                    if (!existing.targetInterface && nw.comment && availableInterfaces?.has(nw.comment)) {
                        updateData.targetInterface = nw.comment;
                    }

                    await db.update(routerNetwatch).set(updateData).where(eq(routerNetwatch.id, existing.id));
                } else {
                    const insertData: any = {
                        routerId,
                        host: nw.host,
                        name: finalName,
                        interval: nw.interval || 30,
                        status: status,
                        lastCheck: new Date(),
                        lastUp: nw.sinceUp,
                        lastDown: nw.sinceDown,
                    };

                    if (nw.comment && availableInterfaces?.has(nw.comment)) {
                        insertData.targetInterface = nw.comment;
                    }

                    await db.insert(routerNetwatch).values(insertData);
                }
            }
        } catch (err) {
            logger.error({ err, router: routerName }, 'Failed to sync netwatch');
        }
    }

    /**
     * Measure latency for netwatch targets
     */
    async measureLatency(routerId: string, routerName: string, conn: any, targets: any[]): Promise<void> {
        const CONCURRENCY_LIMIT = 5;
        const chunks = [];
        for (let i = 0; i < targets.length; i += CONCURRENCY_LIMIT) {
            chunks.push(targets.slice(i, i + CONCURRENCY_LIMIT));
        }

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (target) => {
                try {
                    const { latency, packetLoss } = await measurePing(conn, target.host, 3, '500ms', '1000ms');
                    if (latency >= 0) {
                        await db.update(routerNetwatch).set({
                            latency: latency,
                            lastKnownLatency: latency,
                            packetLoss: packetLoss
                        }).where(eq(routerNetwatch.id, target.id));

                        if (latency > 100 || packetLoss > 0) {
                            await alertService.createPerformanceAlert(
                                routerId,
                                routerName,
                                target.host,
                                target.name || target.host,
                                latency,
                                packetLoss
                            );
                        } else {
                            await alertService.resolvePerformanceAlert(routerId, target.host);
                        }
                    } else {
                        await db.update(routerNetwatch).set({
                            latency: null,
                            packetLoss: packetLoss >= 0 ? packetLoss : null
                        }).where(eq(routerNetwatch.id, target.id));

                        if (packetLoss > 0) {
                            await alertService.createPerformanceAlert(
                                routerId,
                                routerName,
                                target.host,
                                target.name || target.host,
                                0,
                                packetLoss
                            );
                        }
                    }
                } catch (e) {
                    // Ignore ping error
                }
            }));
        }
    }

    /**
     * Propagate interface traffic to netwatch entries based on topology/inheritance
     */
    async propagateTraffic(routerId: string, routerName: string, conn: any): Promise<void> {
        try {
            const entries = await db.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, routerId));
            const entryMap = new Map(entries.map(e => [e.id, e]));

            const resolveInterface = (entry: any, visited = new Set<string>()): string | null => {
                if (visited.has(entry.id)) return null;
                visited.add(entry.id);

                if (entry.targetInterface && entry.targetInterface.trim() !== '') {
                    return entry.targetInterface;
                }

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
                if (iface) {
                    interfaceSet.add(iface);
                    entryInterfaceMap.set(entry.id, iface);
                }
            }

            const interfacesToFetch = [...interfaceSet];
            if (interfacesToFetch.length > 0) {
                const trafficMap = await getInterfaceTraffic(conn, interfacesToFetch);
                for (const entry of entries) {
                    const resolvedIface = entryInterfaceMap.get(entry.id);
                    if (resolvedIface) {
                        const stats = trafficMap.get(resolvedIface);
                        if (stats) {
                            await db.update(routerNetwatch).set({
                                txRate: stats.tx,
                                rxRate: stats.rx,
                                updatedAt: new Date()
                            }).where(eq(routerNetwatch.id, entry.id));
                        }
                    }
                }
            }
        } catch (err) {
            logger.error({ err, router: routerName }, 'Failed to propagate traffic');
        }
    }

    /**
     * Sync netwatch status to ONUs table
     */
    async syncToOnus(routerId: string): Promise<void> {
        try {
            const netwatchEntries = await db.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, routerId));
            if (netwatchEntries.length === 0) {
                logger.info({ routerId }, '[Unified Linkage] No Netwatch entries to sync');
                return;
            }

            // Fetch all ONUs that have a host (IP) assigned
            const activeOnus = await db.select().from(onus).where(isNotNull(onus.host));

            // Create a map for faster lookup, trimming keys to be robust
            const hostToOnuId = new Map(activeOnus.map(o => [(o.host || '').trim(), o]));

            let linkedCount = 0;
            let missedCount = 0;

            for (const entry of netwatchEntries) {
                const host = (entry.host || '').trim();
                if (!host || host === '0.0.0.0') continue;

                const targetOnu = hostToOnuId.get(host);
                if (targetOnu) {
                    let status: 'online' | 'offline' | 'unknown' = 'unknown';
                    if (entry.status === 'up') status = 'online';
                    else if (entry.status === 'down') status = 'offline';

                    const sources = (targetOnu.discoverySources as string[]) || [];
                    if (!sources.includes('netwatch')) sources.push('netwatch');

                    await db.update(onus).set({
                        status: status === 'unknown' ? targetOnu.status : status,
                        lastSeen: new Date(),
                        discoverySources: sources,
                        updatedAt: new Date()
                    }).where(eq(onus.id, targetOnu.id));
                    linkedCount++;
                } else {
                    missedCount++;
                    // Debug: Log missed IPs to help diagnose Proxmox issues
                    if (process.env.NODE_ENV !== 'production' || missedCount <= 10) {
                        logger.debug({ host, routerId }, '[Unified Linkage] Missed sync: No ONU found for host');
                    }
                }
            }

            if (linkedCount > 0 || missedCount > 0) {
                logger.info({ routerId, linkedCount, missedCount }, '[Unified Linkage] Sync complete');
            }
        } catch (e) {
            logger.error({ err: e, routerId }, '[Unified Linkage] Failed to sync Netwatch to ONUs');
        }
    }

    /**
     * Perform a full sync from MikroTik (handles its own connection)
     */
    async fullSync(routerId: string): Promise<{ synced: number; errors: string[] }> {
        const errors: string[] = [];
        let syncedCount = 0;

        const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
        if (!router) throw new Error('Router not found');

        const password = decrypt(router.passwordEncrypted);
        const connection: RouterConnection = {
            host: router.host,
            port: router.port,
            username: router.username,
            password,
        };

        let api: any;
        try {
            api = await connectToRouter(connection);
            const routerClock = await getRouterClock(api).catch(() => undefined);

            // Re-use logic from syncHosts
            await this.syncHosts(routerId, router.name, api);

            // Measure latency immediately
            const entries = await this.getNetwatch(routerId);
            await this.measureLatency(routerId, router.name, api, entries);

            syncedCount = entries.length;
        } catch (error) {
            errors.push(`Failed to sync netwatch: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            if (api) await api.close().catch(() => { });
        }

        await this.syncToOnus(routerId);
        return { synced: syncedCount, errors };
    }
}

export const routerNetwatchService = new RouterNetwatchService();
