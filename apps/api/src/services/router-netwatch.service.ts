import { eq, and, isNotNull, or, sql, desc, getTableColumns, inArray, aliasedTable, count, not } from 'drizzle-orm';
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
    configureNetwatchWebhook,
    removeNetwatchWebhook,
    type RouterConnection,
} from '../lib/mikrotik-api.js';
import { decrypt } from '../lib/encryption.js';
import { alertService } from './alert.service.js';
import { settingsService } from './settings.service.js';
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
                oltId: sql<string>`COALESCE(${onus.oltId}, ${directOlts.id})`.as('oltId'),
                hasWebhook: routerNetwatch.hasWebhook,
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
                            (LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) AND o.name IS NOT NULL AND o.name != '') OR
                            (${routerNetwatch.name} LIKE '%' || o.name || '%' AND o.name IS NOT NULL AND LENGTH(o.name) > 3)
                        )
                    )
                ORDER BY (
                    CASE 
                        WHEN o.id = ${routerNetwatch.linkedOnuId} THEN 1
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.olt_id IN (SELECT id FROM olts WHERE parent_id = ${routerNetwatch.routerId}) THEN 2
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 3
                        WHEN LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) THEN 4
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
                oltId: sql<string>`COALESCE(${onus.oltId}, ${directOlts.id})`.as('oltId'),
                hasWebhook: routerNetwatch.hasWebhook,
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
                            (LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) AND o.name IS NOT NULL AND o.name != '') OR
                            (${routerNetwatch.name} LIKE '%' || o.name || '%' AND o.name IS NOT NULL AND LENGTH(o.name) > 3)
                        )
                    )
                ORDER BY (
                    CASE 
                        WHEN o.id = ${routerNetwatch.linkedOnuId} THEN 1
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.olt_id IN (SELECT id FROM olts WHERE parent_id = ${routerNetwatch.routerId}) THEN 2
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 3
                        WHEN LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) THEN 4
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
            // Fetch Router settings to check if Webhook is enabled
            const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
            const shouldInjectWebhook = router?.useWebhook && !!router?.webhookSecret;
            const webhookUrl = shouldInjectWebhook ? await settingsService.getWebhookUrl(router.webhookSecret!, router.tenantId!) : '';

            logger.info({ routerId, name: routerName, shouldInjectWebhook, useWebhook: router?.useWebhook, hasSecret: !!router?.webhookSecret }, 'Netwatch sync starting');

            // First fetch the router's current clock to calculate the exact offset
            const routerClock = await getRouterClock(conn).catch(() => undefined);
            const mikrotikNetwatch = await getNetwatchHosts(conn, routerClock);

            const existingEntries = await db
                .select()
                .from(routerNetwatch)
                .where(eq(routerNetwatch.routerId, routerId));

            const existingMap = new Map(existingEntries.map(e => [e.host, e]));
            const processedHosts = new Set<string>();

            await db.transaction(async (tx) => {
                for (const nw of mikrotikNetwatch) {
                    if (!nw.host) continue;
                    processedHosts.add(nw.host);

                    const existing = existingMap.get(nw.host);
                    const status: 'up' | 'down' | 'unknown' = (nw.status === 'up') ? 'up' : (nw.status === 'down' ? 'down' : 'unknown');

                    const prefix = nw.disabled ? '[DISABLED] ' : '';
                    let baseName = nw.comment || nw.name;
                    if (!baseName && existing) {
                        baseName = existing.name?.replace(/^\[DISABLED\]\s*/, '') || '';
                    }
                    const finalName = prefix + (baseName || '');

                    // Send alerts if status changed
                    if (existing && existing.status !== status && existing.status !== 'unknown' && status !== 'unknown') {
                        if (status === 'down' || status === 'up') {
                            await alertService.createNetwatchAlert(
                                routerId,
                                `[${routerName}] ${finalName}`,
                                nw.host,
                                status
                            );
                        }
                    }

                    // Webhook detection with "Flap-Protection" and Truncation-Awareness
                    const hasUpWebhook = nw.upScript?.toLowerCase().includes('/api/webhook/netwatch');
                    const hasDownWebhook = nw.downScript?.toLowerCase().includes('/api/webhook/netwatch');
                    const detectedWebhook = (hasUpWebhook || hasDownWebhook) || false;

                    const isSuspiciouslyEmpty = (!nw.upScript || nw.upScript === '') && (!nw.downScript || nw.downScript === '');
                    const isLikelyTruncated = !detectedWebhook && existing?.hasWebhook && ((nw.upScript?.length || 0) > 64 || (nw.downScript?.length || 0) > 64);
                    let finalHasWebhook = isSuspiciouslyEmpty ? (existing?.hasWebhook || false) : (detectedWebhook || isLikelyTruncated);

                    // Smart Append/Cleanup Webhook scripts if Webhook feature is enabled
                    const deviceType = existing?.deviceType || 'client';
                    if (shouldInjectWebhook && deviceType !== 'odp' && nw.host) {
                        let forceReconfig = false;
                        if (finalHasWebhook) {
                            // SELF-HEALING: Check if the existing token in the script is still valid/active.
                            // If it belongs to a router that has webhooks disabled, we must take over.
                            const combo = (nw.upScript || '') + (nw.downScript || '');
                            const tokenMatch = combo.match(/token=([a-f0-9]+)/i);
                            const currentToken = tokenMatch ? tokenMatch[1] : null;

                            if (currentToken && currentToken !== router.webhookSecret) {
                                const [owner] = await db.select({ id: routers.id, useWebhook: routers.useWebhook })
                                    .from(routers)
                                    .where(eq(routers.webhookSecret, currentToken));

                                // If no one owns this token, or the owner has disabled webhooks, it's a stale token.
                                if (!owner || !owner.useWebhook) {
                                    forceReconfig = true;
                                    logger.info({ host: nw.host, staleToken: currentToken, routerId }, 'Stale or unauthorized webhook token detected in MikroTik, forcing takeover');
                                }
                            }
                        }

                        // Use finalHasWebhook to avoid loops caused by bulk print truncation or random read failures
                        if (!finalHasWebhook || forceReconfig) {
                            logger.debug({
                                host: nw.host,
                                suspicious: isSuspiciouslyEmpty,
                                upLen: nw.upScript?.length,
                                downLen: nw.downScript?.length,
                                isTruncated: isLikelyTruncated,
                                forceReconfig
                            }, 'Webhook missing or stale, triggering configuration');

                            try {
                                await configureNetwatchWebhook(conn, nw.host, webhookUrl, nw, forceReconfig);
                                finalHasWebhook = true; // Update state for DB update below
                            } catch (err) {
                                logger.warn({ err: String(err), host: nw.host }, 'Failed to configure webhook');
                            }
                        }
                    } else if (!shouldInjectWebhook && finalHasWebhook) {
                        // Smart Cleanup: Remove webhook if disabled but still present on router.
                        // COLLISION PREVENTION: Check if ANY other router with the same host (or physical device) has webhook enabled. 
                        try {
                            const normalizeHost = (h: string) => h.split(':')[0].trim().toLowerCase();
                            const targetHostBase = normalizeHost(router.host);

                            const allWantsWebhook = await db.select()
                                .from(routers)
                                .where(and(
                                    eq(routers.useWebhook, true),
                                    not(eq(routers.id, routerId))
                                ));

                            const otherWantsItems = allWantsWebhook.filter(r => {
                                // 1. Hardware Identity Match (Strongest)
                                const sMatch = router.serialNumber && r.serialNumber && router.serialNumber.trim() !== '' && r.serialNumber.trim() === router.serialNumber.trim();
                                const iMatch = router.identity && r.identity && router.identity.trim() !== '' && r.identity.trim() === router.identity.trim();
                                if (sMatch || iMatch) return true;

                                // Base Host Match (Ignoring Ports)
                                if (normalizeHost(r.host) === targetHostBase) return true;

                                return false;
                            });

                            if (otherWantsItems.length === 0) {
                                logger.info({ host: nw.host, routerId }, 'No other routers want webhooks on this device, proceeding with cleanup');
                                await removeNetwatchWebhook(conn, nw.host, nw);
                                finalHasWebhook = false;
                            } else {
                                const names = otherWantsItems.map(r => r.name).join(', ');
                                logger.info({ host: nw.host, routerId, othersCount: otherWantsItems.length, conflictingRouters: names }, 'Skipping webhook cleanup: another logical router on this physical box has webhooks enabled');
                            }
                        } catch (err) {
                            logger.warn({ err: String(err), host: nw.host }, 'Failed to smart-cleanup webhook or check collisions');
                        }
                    }

                    if (existing) {
                        const updateData: any = {
                            name: finalName,
                            interval: nw.interval || existing.interval,
                            status: status,
                            lastCheck: new Date(),
                            lastUp: nw.sinceUp || existing.lastUp,
                            lastDown: nw.sinceDown || existing.lastDown,
                            updatedAt: new Date(),
                            hasWebhook: finalHasWebhook,
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
                            hasWebhook: finalHasWebhook,
                            tenantId: router.tenantId
                        };

                        if (nw.comment && availableInterfaces?.has(nw.comment)) {
                            insertData.targetInterface = nw.comment;
                        }

                        await tx.insert(routerNetwatch).values(insertData);
                    }
                }

                // Delete entries that no longer exist on MikroTik (Clients with IP only)
                const toDelete = existingEntries.filter(e =>
                    e.deviceType === 'client' &&
                    !e.isAppOnly &&
                    e.host &&
                    e.host !== '' &&
                    e.host !== '0.0.0.0' &&
                    !processedHosts.has(e.host)
                );

                if (toDelete.length > 0) {
                    logger.info({ routerId, count: toDelete.length }, 'Cleaning up deleted Netwatch entries (Clients with IP only)');
                    await tx.delete(routerNetwatch).where(inArray(routerNetwatch.id, toDelete.map(e => e.id)));
                }

                // Update lastCheck for all entries to show activity
                await tx.update(routerNetwatch).set({ lastCheck: new Date() }).where(eq(routerNetwatch.routerId, routerId));
            });
        } catch (err: any) {
            logger.error({ err: err?.message || String(err), router: routerName }, 'Failed to sync netwatch');
        }
    }

    /**
     * Measure latency for netwatch targets
     */
    async measureLatency(routerId: string, routerName: string, conn: any, targets: any[]): Promise<void> {
        // Dynamic concurrency based on total device count to prevent API stress
        const totalNetwatch = await db.select({ count: count() }).from(routerNetwatch).then(res => res[0]?.count || 0);

        let concurrencyLimit = 20;
        if (totalNetwatch > 500) concurrencyLimit = 5;
        else if (totalNetwatch > 200) concurrencyLimit = 10;
        else if (totalNetwatch > 50) concurrencyLimit = 15;

        const chunks = [];
        for (let i = 0; i < targets.length; i += concurrencyLimit) {
            chunks.push(targets.slice(i, i + concurrencyLimit));
        }

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (target) => {
                try {
                    // Skip ping for disabled devices
                    if (target.name?.includes('[DISABLED]')) {
                        return;
                    }

                    // Stability-First Ping: 2 packets, 300ms interval, 5000ms timeout
                    const { latency, packetLoss } = await measurePing(conn, target.host, 2, '300ms', '5000ms');

                    if (latency >= 0) {
                        const updateData: any = {
                            latency: latency,
                            lastKnownLatency: latency,
                            packetLoss: packetLoss,
                            updatedAt: new Date()
                        };

                        // For app-only entries, we define the status ourselves via this ping
                        if (target.isAppOnly) {
                            updateData.status = 'up';
                            updateData.lastUp = new Date();
                        }

                        await db.update(routerNetwatch).set(updateData).where(eq(routerNetwatch.id, target.id));

                        if (latency > 100 || packetLoss > 0) {
                            await alertService.createPerformanceAlert(
                                routerId,
                                routerName,
                                target.host,
                                target.name || target.host,
                                latency,
                                packetLoss,
                                target.status === 'unknown' ? 'up' : target.status
                            );
                        } else {
                            await alertService.resolvePerformanceAlert(routerId, target.host);
                        }
                    } else {
                        const updateData: any = {
                            latency: null,
                            packetLoss: packetLoss >= 0 ? packetLoss : null,
                            updatedAt: new Date()
                        };

                        if (target.isAppOnly) {
                            updateData.status = 'down';
                            updateData.lastDown = new Date();
                        }

                        await db.update(routerNetwatch).set(updateData).where(eq(routerNetwatch.id, target.id));

                        if (packetLoss > 0) {
                            await alertService.createPerformanceAlert(
                                routerId,
                                routerName,
                                target.host,
                                target.name || target.host,
                                0,
                                packetLoss,
                                target.status === 'unknown' ? 'down' : target.status
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

            const activeOnus = await db.select().from(onus).where(isNotNull(onus.host));
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
            await this.syncHosts(routerId, router.name, api);

            const entries = await this.getNetwatch(routerId);
            await this.measureLatency(routerId, router.name, api, entries);

            syncedCount = entries.length;
        } catch (error: any) {
            const errorMessage = error?.message || String(error);
            logger.error({ err: error, router: router.name }, '[RouterNetwatchService] Sync failed');
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
        if (entry.host) {
            await this.syncToOnus(entry.routerId);
        }
        logger.debug({ netwatchId: entry.id }, 'Netwatch entry updated in real-time service');
    }

    /**
     * Ensure an app-only netwatch entry exists for the given host
     */
    async ensureAppOnlyEntry(routerId: string, host: string, name: string, type: string, tenantId?: string): Promise<string> {
        const [existing] = await db.select()
            .from(routerNetwatch)
            .where(and(eq(routerNetwatch.routerId, routerId), eq(routerNetwatch.host, host)));

        if (existing) {
            if (existing.isAppOnly) return existing.id;
            await db.update(routerNetwatch).set({ isAppOnly: true, updatedAt: new Date() }).where(eq(routerNetwatch.id, existing.id));
            return existing.id;
        }

        let deviceType: any = 'client';
        if (type === 'olt') deviceType = 'olt';
        else if (type === 'router') deviceType = 'router';
        else if (type === 'switch') deviceType = 'switch';

        const [inserted] = await db.insert(routerNetwatch).values({
            routerId,
            host,
            name,
            deviceType,
            isAppOnly: true,
            tenantId,
            status: 'unknown',
            interval: 60,
        } as any).returning();

        return inserted.id;
    }
}

export const routerNetwatchService = new RouterNetwatchService();
