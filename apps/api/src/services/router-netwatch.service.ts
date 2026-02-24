import { eq, and, isNotNull, or, sql, desc, getTableColumns, inArray, aliasedTable } from 'drizzle-orm';
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
        const directOlts = aliasedTable(olts, 'directOlts');

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

                // Added for friendly OLT-style formatting (e.g. PON02/1)
                ponId: onus.ponPort,
                onuId: onus.onuIndex,

                // Allow manual override if already linked via ID
                linkedOnuId: routerNetwatch.linkedOnuId,
                oltName: sql<string>`COALESCE(${olts.name}, ${directOlts.name})`.as('oltName'),
                oltId: sql<string>`COALESCE(${onus.oltId}, ${directOlts.id})`.as('oltId')
            })
            .from(routerNetwatch)
            .leftJoin(onus, eq(onus.id, sql`(
                SELECT id FROM onus o
                WHERE 
                    o.id = ${routerNetwatch.linkedOnuId} OR
                    (
                        o.router_id = ${routerNetwatch.routerId} AND 
                        (
                            (TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.host IS NOT NULL AND o.host != '') OR
                            (TRIM(o.name) = TRIM(${routerNetwatch.name}) AND o.name IS NOT NULL AND o.name != '')
                        )
                    )
                ORDER BY (
                    CASE 
                        WHEN o.id = ${routerNetwatch.linkedOnuId} THEN 1
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.olt_id IN (SELECT id FROM olts WHERE parent_id = ${routerNetwatch.routerId}) THEN 2
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 3
                        WHEN TRIM(o.name) = TRIM(${routerNetwatch.name}) AND o.olt_id IN (SELECT id FROM olts WHERE parent_id = ${routerNetwatch.routerId}) THEN 4
                        ELSE 5
                    END
                ) ASC
                LIMIT 1
            )`))
            .leftJoin(olts, eq(onus.oltId, olts.id))
            .leftJoin(directOlts, and(
                sql`TRIM(${routerNetwatch.name}) = TRIM(${directOlts.name})`,
                eq(directOlts.parentId, routerNetwatch.routerId)
            ))
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

        const directOlts = aliasedTable(olts, 'directOlts');

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
                lastDownReason: onus.lastDownReason,
                lastSeen: onus.lastSeen,
                physicalStatus: onus.status,
                discoverySources: onus.discoverySources,
                ponPort: onus.ponPort,
                onuIndex: onus.onuIndex,

                // Added for friendly OLT-style formatting (e.g. PON02/1)
                ponId: onus.ponPort,
                onuId: onus.onuIndex,

                linkedOnuId: routerNetwatch.linkedOnuId,
                oltName: sql<string>`COALESCE(${olts.name}, ${directOlts.name})`.as('oltName'),
                oltId: sql<string>`COALESCE(${onus.oltId}, ${directOlts.id})`.as('oltId')
            })

            .from(routerNetwatch)
            .leftJoin(onus, eq(onus.id, sql`(
                SELECT id FROM onus o
                WHERE 
                    o.id = ${routerNetwatch.linkedOnuId} OR
                    (
                        o.router_id = ${routerNetwatch.routerId} AND 
                        (
                            (TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.host IS NOT NULL AND o.host != '') OR
                            (TRIM(o.name) = TRIM(${routerNetwatch.name}) AND o.name IS NOT NULL AND o.name != '')
                        )
                    )
                ORDER BY (
                    CASE 
                        WHEN o.id = ${routerNetwatch.linkedOnuId} THEN 1
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.olt_id IN (SELECT id FROM olts WHERE parent_id = ${routerNetwatch.routerId}) THEN 2
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 3
                        WHEN TRIM(o.name) = TRIM(${routerNetwatch.name}) AND o.olt_id IN (SELECT id FROM olts WHERE parent_id = ${routerNetwatch.routerId}) THEN 4
                        ELSE 5
                    END
                ) ASC
                LIMIT 1
            )`))
            .leftJoin(olts, eq(onus.oltId, olts.id))
            .leftJoin(directOlts, and(
                sql`TRIM(${routerNetwatch.name}) = TRIM(${directOlts.name})`,
                eq(directOlts.parentId, routerNetwatch.routerId)
            ))
            .where(inArray(routerNetwatch.routerId, routerIds))
            .orderBy(routerNetwatch.host) as any;
    }

    /**
     * Sync and update hosts status from MikroTik (inside an existing connection)
     */
    async syncHosts(routerId: string, routerName: string, conn: any, availableInterfaces?: Set<string>): Promise<void> {
        try {
            // First fetch the router's current clock to calculate the exact offset
            // We need this because MikroTik sends times without timezone info
            const routerClock = await getRouterClock(conn).catch(() => undefined);
            const mikrotikNetwatch = await getNetwatchHosts(conn, routerClock);


            const existingEntries = await db
                .select()
                .from(routerNetwatch)
                .where(eq(routerNetwatch.routerId, routerId));

            const existingMap = new Map(existingEntries.map(e => [e.host, e]));

            await db.transaction(async (tx) => {
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
                                // Important: We do NOT await alertService inside the tx to avoid blocking the DB connection,
                                // but doing it here is acceptable for simplicity since the latency overhead is small.
                                // If the transaction fails, an alert might be produced but the DB rolls back - an acceptable trade-off for monitoring urgency.
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

                        await tx.update(routerNetwatch).set(updateData).where(eq(routerNetwatch.id, existing.id));
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

                        await tx.insert(routerNetwatch).values(insertData);
                    }
                }
            });
        } catch (err: any) {
            logger.error({ err: err?.message || String(err), router: routerName }, 'Failed to sync netwatch');
        }
    }

    /**
     * Measure latency for netwatch targets
     */
    async measureLatency(routerId: string, routerName: string, conn: any, targets: any[]): Promise<void> {
        // Increase concurrency for faster batch processing (was 5)
        const CONCURRENCY_LIMIT = 20;
        const chunks = [];
        for (let i = 0; i < targets.length; i += CONCURRENCY_LIMIT) {
            chunks.push(targets.slice(i, i + CONCURRENCY_LIMIT));
        }

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (target) => {
                try {
                    // Optimized ping: 2 packets, 100ms interval = ~200ms per host
                    // This prevents 504 timeouts when syncing many hosts
                    const { latency, packetLoss } = await measurePing(conn, target.host, 2, '100ms', '1000ms');
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
        } catch (err: any) {
            logger.error({ err: err?.message || String(err), router: routerName }, 'Failed to propagate traffic');
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

        let api: any;
        try {
            const password = decrypt(router.passwordEncrypted);
            const connection: RouterConnection = {
                host: router.host,
                port: router.port,
                username: router.username,
                password,
            };

            api = await connectToRouter(connection);
            const routerClock = await getRouterClock(api).catch(() => undefined);

            // Re-use logic from syncHosts
            await this.syncHosts(routerId, router.name, api);

            // Measure latency immediately
            const entries = await this.getNetwatch(routerId);
            await this.measureLatency(routerId, router.name, api, entries);

            syncedCount = entries.length;
        } catch (error: any) {
            const errorMessage = error?.message || String(error);
            console.error(`[RouterNetwatchService] Sync failed for router ${router.name}:`, errorMessage);
            errors.push(`Failed to sync netwatch: ${errorMessage}`);
        } finally {
            if (api) await api.close().catch(() => { });
        }

        await this.syncToOnus(routerId);
        return { synced: syncedCount, errors };
    }

    /**
     * Update a single netwatch entry in the real-time cache or trigger related updates
     */
    async update(entry: RouterNetwatch): Promise<void> {
        // Trigger status sync to ONUs if needed
        if (entry.host) {
            await this.syncToOnus(entry.routerId);
        }

        // This is a placeholder for any other real-time update logic needed
        // for the map (e.g., Socket.io broadcasts if they existed here)
        logger.debug({ netwatchId: entry.id }, 'Netwatch entry updated in real-time service');
    }
}

export const routerNetwatchService = new RouterNetwatchService();
