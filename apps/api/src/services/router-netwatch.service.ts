import { eq, and, isNotNull, or, sql, desc, getTableColumns, inArray, count, not } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import {
    routers,
    routerNetwatch,
    onus,
    olts,
    alerts,
    topologyNodes,
    devicePerformanceHistory,
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
    addNetwatchEntry,
    updateNetwatchEntry,
    removeNetwatchEntry,
    type RouterConnection,
} from '../lib/mikrotik-api.js';
import { decrypt } from '../lib/encryption.js';
import { alertService } from './alert.service.js';
import { settingsService } from './settings.service.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../middleware/error.middleware.js';
import { eventEmitter } from './event-emitter.service.js';

export class RouterNetwatchService {
    /**
     * Internal helper to find a router and decrypt its password.
     */
    private async findRouterWithPassword(id: string, tenantId?: string): Promise<any> {
        const filters = [eq(routers.id, id)];
        if (tenantId) filters.push(eq(routers.tenantId, tenantId));
        const [router] = await db.select().from(routers).where(and(...filters));
        if (!router) return null;
        return {
            ...router,
            password: router.passwordEncrypted ? decrypt(router.passwordEncrypted) : '',
        };
    }

    /**
     * Get all netwatch entries for a router with detailed info (ONUs/Alerts)
     */
    async getNetwatch(routerId: string): Promise<any[]> {
        const directOlts = alias(olts, 'directOlts');

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
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 2
                        WHEN LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) THEN 3
                        ELSE 4
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

        const directOlts = alias(olts, 'directOlts');

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
                        WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 2
                        WHEN LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) THEN 3
                        ELSE 4
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
            const shouldInjectWebhook = router?.useWebhook && !!router?.webhookSecret && !!router?.tenantId;
            const webhookUrl = shouldInjectWebhook ? await settingsService.getWebhookUrl(router.webhookSecret!, router.tenantId!) : '';

            const os = await import('os');
            const hostname = os.hostname();
            
            const baseUrl = await settingsService.getSettingValue<string>('webhook_base_url', router.tenantId!, 'http://localhost:5173');
            const cleanBaseUrl = (baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl).toLowerCase();
            
            logger.info({ routerId, name: routerName, shouldInjectWebhook, useWebhook: router?.useWebhook, hasSecret: !!router?.webhookSecret, server: hostname, baseUrl: cleanBaseUrl }, 'Netwatch sync starting');

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
                    const isDisabled = nw.disabled === true;

                    // Debug: log disabled state detection
                    if (isDisabled) {
                        logger.debug({ host: nw.host, disabled: nw.disabled, routerId }, 'Netwatch entry detected as DISABLED');
                    }

                    let finalName = nw.comment || nw.name;
                    if (!finalName && existing) {
                        finalName = existing.name?.replace(/^\[DISABLED\]\s*/, '') || '';
                    }

                    // Send alerts if status changed — but SUPPRESS for disabled entries
                    if (!isDisabled && existing && existing.status !== status && existing.status !== 'unknown' && status !== 'unknown') {
                        if (status === 'down' || status === 'up') {
                            await alertService.createNetwatchAlert(
                                routerId,
                                `[${routerName}] ${finalName}`,
                                nw.host,
                                status
                            );
                        }
                    }

                    // Webhook detection requiring BOTH scripts to be present for a "Complete" state
                    const hasUpWebhook = nw.upScript?.toLowerCase().includes('/api/webhook/netwatch');
                    const hasDownWebhook = nw.downScript?.toLowerCase().includes('/api/webhook/netwatch');
                    const detectedWebhook = (hasUpWebhook && hasDownWebhook) || false;
                    const isPartiallyMissing = (hasUpWebhook || hasDownWebhook) && !detectedWebhook;

                    // ORIGIN DETECTION: Check if this webhook belongs to US (this server instance) AND this specific router
                    const isOurUpWebhook = nw.upScript?.toLowerCase().includes(cleanBaseUrl) && (router?.webhookSecret && nw.upScript?.includes(router.webhookSecret));
                    const isOurDownWebhook = nw.downScript?.toLowerCase().includes(cleanBaseUrl) && (router?.webhookSecret && nw.downScript?.includes(router.webhookSecret));
                    const isOurWebhook = isOurUpWebhook || isOurDownWebhook;

                    // STRICT TOKEN AWARENESS: A router only "has a webhook" if it owns the token
                    let finalHasWebhook = detectedWebhook && isOurWebhook;

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

                            // NEW: If it has a webhook but it's not OURS (wrong domain/baseUrl), force reconfig
                            // This handles the transition from localhost to domain without needing a token change
                            if (!isOurWebhook && detectedWebhook) {
                                forceReconfig = true;
                                logger.info({ host: nw.host, routerId, baseUrl: cleanBaseUrl }, 'Webhook domain mismatch detected (e.g. localhost vs domain), forcing reconfig');
                            }
                        }

                        // Trigger injection if the webhook is not "Complete" (both UP and DOWN), 
                        // explicitly missing from one, or if we need a token takeover.
                        // BUGFIX: Skip "Partially Missing" check if we suspect truncation (to avoid infinite reconfig loops)
                        if (!finalHasWebhook || isPartiallyMissing || forceReconfig) {
                            if (detectedWebhook && !isOurWebhook) {
                                // Extract the token currently on the router (if any)
                                const upMatch = nw.upScript?.match(/token=([a-zA-Z0-9_-]+)/);
                                const downMatch = nw.downScript?.match(/token=([a-zA-Z0-9_-]+)/);
                                const existingToken = upMatch?.[1] || downMatch?.[1];

                                // If the webhook exists but isn't ours, and it has a token, check if that token is valid.
                                // If it's not valid, or belongs to a disabled router, we can take over.
                                if (existingToken) {
                                    const [owner] = await db.select({ id: routers.id, useWebhook: routers.useWebhook })
                                        .from(routers)
                                        .where(eq(routers.webhookSecret, existingToken));

                                    if (!owner || !owner.useWebhook) {
                                        forceReconfig = true;
                                        logger.info({ host: nw.host, existingToken, routerId }, 'Detected foreign/stale webhook token, forcing takeover');
                                    }
                                } else {
                                    // If no token is found, it's likely a manual or old webhook, we can take over.
                                    forceReconfig = true;
                                    logger.info({ host: nw.host, routerId }, 'Detected foreign webhook without token, forcing takeover');
                                }
                            }

                            logger.debug({
                                host: nw.host,
                                upLen: nw.upScript?.length,
                                downLen: nw.downScript?.length,
                                forceReconfig,
                                server: hostname
                            }, 'Webhook missing or stale, triggering configuration');

                            try {
                                await configureNetwatchWebhook(conn, nw.host, webhookUrl, nw, forceReconfig);
                                
                                // Only mark as true if we actually own it or successfully forced a takeover.
                                // If forceReconfig is false and it belongs to another active router, we skipped it.
                                if (!detectedWebhook || isOurWebhook || forceReconfig) {
                                    finalHasWebhook = true; 
                                }
                            } catch (err) {
                                logger.warn({ err: String(err), host: nw.host }, 'Failed to configure webhook');
                            }
                        }
                    } else if (!shouldInjectWebhook && isOurWebhook) {
                        // Smart Cleanup: Remove webhook if disabled but still present on router AND belongs to us.
                        try {
                            const normalizeHost = (h: string) => h.split(':')[0].trim().toLowerCase();
                            const targetHostBase = normalizeHost(router.host);

                            logger.info({ host: nw.host, routerId, server: hostname, url: nw.upScript || nw.downScript }, 'Webhook disabled for this router, proceeding with cleanup');
                            await removeNetwatchWebhook(conn, nw.host, router.webhookSecret || '', nw);
                            finalHasWebhook = false;
                        } catch (err) {
                            logger.warn({ err: String(err), host: nw.host }, 'Failed to smart-cleanup webhook');
                        }
                    }

                    if (existing) {
                        const updateData: any = {
                            name: finalName,
                            interval: nw.interval || existing.interval,
                            status: status,
                            disabled: isDisabled,
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
                            disabled: isDisabled,
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
                    const { latency, packetLoss, error: pingError } = await measurePing(conn, target.host, 2, '300ms', '5000ms');
                    logger.debug({ host: target.host, routerId, latency, packetLoss, pingError }, '[MeasureLatency] Ping result calculated');

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

                        try {
                            await db.insert(devicePerformanceHistory).values({
                                tenantId: target.tenantId,
                                routerId: target.routerId,
                                host: target.host,
                                onuId: target.linkedOnuId || (await (async () => {
                                    // REAL-TIME LOOKUP: If no link exists in netwatch, check if any ONU has this host
                                    const [match] = await db.select({ id: onus.id }).from(onus).where(eq(onus.host, target.host)).limit(1);
                                    return match?.id || null;
                                })()),
                                latency: latency,
                                recordedAt: new Date()
                            });
                        } catch (histErr: any) {
                            logger.error({ err: histErr?.message || String(histErr), host: target.host, routerId }, '[MeasureLatency] Failed to insert latency to devicePerformanceHistory');
                        }

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

                        // 📈 Record the Error in History for Charts/Tooltips
                        try {
                            await db.insert(devicePerformanceHistory).values({
                                tenantId: target.tenantId,
                                routerId: target.routerId,
                                host: target.host,
                                onuId: target.linkedOnuId || (await (async () => {
                                    const [match] = await db.select({ id: onus.id }).from(onus).where(eq(onus.host, target.host)).limit(1);
                                    return match?.id || null;
                                })()),
                                latency: null,
                                errorMessage: pingError || 'Unreachable',
                                recordedAt: new Date()
                            });
                        } catch (histErr: any) {
                            logger.error({ err: histErr?.message || String(histErr), host: target.host, routerId }, '[MeasureLatency] Failed to insert error record to devicePerformanceHistory');
                        }

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
                } catch (e: any) {
                    logger.warn({ err: e?.message || String(e), host: target.host }, '[MeasureLatency] Full error for target ping');
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
            // SCOPED CHECK: Only sync if this router has OLTs linked to it.
            // This prevents unnecessary queries for routers without OLT/ACS.
            const linkedOlts = await db.select({ id: olts.id })
                .from(olts)
                .where(eq(olts.parentId, routerId));

            if (linkedOlts.length === 0) {
                // FALLBACK: If this router has no direct OLT children, it might be a Core Router 
                // monitoring devices that are physically connected to OTHER routers (e.g. OLT routers).
                // We should check ALL ONUs in the same tenant to allow cross-router linkage.
                const [router] = await db.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, routerId)).limit(1);
                if (!router?.tenantId) return;

                const activeOnus = await db.select().from(onus).where(eq(onus.tenantId, router.tenantId));
                if (activeOnus.length === 0) return;

                // Continue with these ONUs
                return this.performLinkage(routerId, activeOnus);
            }

            const oltIds = linkedOlts.map(o => o.id);
            const activeOnus = await db.select().from(onus)
                .where(inArray(onus.oltId, oltIds));

            if (activeOnus.length === 0) {
                return;
            }

            return this.performLinkage(routerId, activeOnus);
        } catch (err: any) {
            logger.error({ err: err?.message || String(err), routerId }, 'Failed to sync netwatch to onus');
        }
    }

    /**
     * Shared linkage logic (extracted from syncToOnus)
     */
    private async performLinkage(routerId: string, activeOnus: any[]): Promise<void> {
        try {
            const netwatchEntries = await db.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, routerId));
            if (netwatchEntries.length === 0) return;

            // 1. Map ONUs by Host (High Confidence)
            const hostToOnu = new Map(activeOnus.filter(o => o.host).map(o => [(o.host || '').trim(), o]));
            
            // 2. Map ONUs by Name (Fallback for NULL hosts)
            const nameToOnu = new Map(activeOnus.filter(o => !o.host).map(o => [(o.name || '').toLowerCase().trim(), o]));

            let linkedCount = 0;
            let missedCount = 0;

            for (const entry of netwatchEntries) {
                const host = (entry.host || '').trim();
                const entryNameNormalized = (entry.name || '').toLowerCase().trim();
                if (!host || host === '0.0.0.0') continue;

                const targetOnu = hostToOnu.get(host) || nameToOnu.get(entryNameNormalized);
                
                if (targetOnu) {
                    const status = entry.status === 'up' ? 'online' : (entry.status === 'down' ? 'offline' : targetOnu.status);
                    
                    // Update ONU table
                    const onuUpdateData: any = {
                        status,
                        lastSeen: status === 'online' ? new Date() : targetOnu.lastSeen,
                        updatedAt: new Date(),
                    };

                    // AUTO-POPULATE HOST: If the ONU was matched by name but had no host, set it now
                    if (!targetOnu.host && host) {
                        onuUpdateData.host = host;
                        logger.info({ onu: targetOnu.name, sn: targetOnu.sn, host }, '[Linkage] Auto-populated host from Netwatch match');
                    }

                    const sources = (targetOnu.discoverySources as string[]) || [];
                    if (!sources.includes('netwatch')) sources.push('netwatch');
                    onuUpdateData.discoverySources = sources;

                    await db.update(onus).set(onuUpdateData).where(eq(onus.id, targetOnu.id));

                    // PERSIST LINKAGE: Update Netwatch entry to point to this ONU
                    if (entry.linkedOnuId !== targetOnu.id) {
                        await db.update(routerNetwatch)
                            .set({ linkedOnuId: targetOnu.id })
                            .where(eq(routerNetwatch.id, entry.id));
                        logger.debug({ host, onuId: targetOnu.id }, '[Linkage] Persisted linkedOnuId in Netwatch entry');
                    }

                    linkedCount++;
                } else {
                    missedCount++;
                    
                    // If previously linked but now no match, clear the link?
                    // For now, let's keep it to avoid "flickering" links if one fetch fails.
                }
            }

            if (linkedCount > 0) {
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
            if (api) api.release();
        }

        await this.syncToOnus(routerId);
        return { synced: syncedCount, errors };
    }

    /**
     * Create a netwatch entry
     */
    async create(
        routerId: string,
        data: {
            host?: string;
            name?: string;
            deviceType?: 'client' | 'olt' | 'odp' | 'router' | 'switch';
            interval?: number;
            latitude?: string;
            longitude?: string;
            location?: string;
            waypoints?: string;
            connectionType?: 'router' | 'client';
            connectedToId?: string | null;
            targetInterface?: string | null;
            linkedOnuId?: string | null;
            isAppOnly?: boolean;
        },
        tenantId?: string
    ): Promise<RouterNetwatch> {
        // 1. Apply to Router first (only for client type with host)
        const router = await this.findRouterWithPassword(routerId, tenantId);
        if (!router) {
            logger.warn({ routerId }, 'Router not found for netwatch creation');
            throw new ApiError(404, 'Router not found');
        }

        // Only add to MikroTik if it's a netwatch client/router/switch type (has IP to ping) AND is NOT App-Only
        const isMikrotikPingable = (!data.deviceType || ['client', 'router', 'switch'].includes(data.deviceType)) && data.host && data.host !== '0.0.0.0' && data.isAppOnly !== true;

        if (isMikrotikPingable) {
            let conn;
            try {
                conn = await connectToRouter({
                    host: router.host,
                    port: router.port,
                    username: router.username,
                    password: router.password,
                });

                await addNetwatchEntry(conn, {
                    host: data.host as string,
                    interval: data.interval,
                    comment: data.name || 'Monitoring Node',
                });

                // Smart Append Webhook scripts if Webhook feature is enabled
                if (router.useWebhook && router.webhookSecret && router.tenantId) {
                    const webhookUrl = await settingsService.getWebhookUrl(router.webhookSecret, router.tenantId);
                    await configureNetwatchWebhook(conn, data.host as string, webhookUrl);
                }

                logger.info({ routerId, host: data.host, name: data.name }, 'Netwatch entry added to MikroTik router');
            } catch (err: any) {
                const msg = err?.message || String(err);
                logger.error({ err: msg, routerId, host: data.host }, 'Failed to add netwatch to router');
                throw new ApiError(500, `Failed to add to router: ${msg}`);
            } finally {
                if (conn) conn.release();
            }
        }

        const insertData: any = {
            routerId,
            host: data.host || '', // Default to empty string for ODP without host
            name: data.name,
            deviceType: data.deviceType || 'client',
            interval: data.interval || 30,
            latitude: data.latitude,
            longitude: data.longitude,
            location: data.location,
            waypoints: data.waypoints,
            connectionType: data.connectionType || 'router',
            connectedToId: data.connectedToId,
            targetInterface: data.targetInterface,
            linkedOnuId: data.linkedOnuId,
            status: data.host ? 'unknown' : 'up', // ODP without host is always "up"
            isAppOnly: data.isAppOnly || false,
        };

        try {
            const [netwatch] = await db
                .insert(routerNetwatch)
                .values(insertData)
                .returning();

            // Notify real-time listeners
            await this.update(netwatch);

            return netwatch;
        } catch (dbErr) {
            logger.error({ err: dbErr, data: insertData, routerId }, 'Failed to insert netwatch into DB');
            throw new ApiError(500, `Database error: ${dbErr instanceof Error ? dbErr.message : 'Unknown database error'}`);
        }
    }

    /**
     * Update a netwatch entry
     */
    async updateEntry(
        routerId: string,
        netwatchId: string,
        data: {
            host?: string;
            name?: string;
            deviceType?: 'client' | 'olt' | 'odp' | 'router' | 'switch';
            interval?: number;
            latitude?: string | null;
            longitude?: string | null;
            location?: string | null;
            waypoints?: string | null;
            connectionType?: 'router' | 'client';
            connectedToId?: string | null;
            targetInterface?: string | null;
            status?: 'up' | 'down' | 'unknown';
            linkedOnuId?: string | null;
            isAppOnly?: boolean;
        },
        tenantId?: string
    ): Promise<RouterNetwatch | undefined> {
        // 0. Get original entry to know the host and check tenant
        const filters = [eq(routerNetwatch.id, netwatchId)];
        if (tenantId) {
            const routerCheck = await this.findRouterWithPassword(routerId, tenantId);
            if (!routerCheck) throw new Error('Router not found or access denied');
        }

        const [original] = await db.select().from(routerNetwatch).where(and(...filters));
        if (!original) throw new Error('Netwatch entry not found');

        // 1. Apply to Router (only for client types and only if relevant fields change)
        const isVirtualHost = original.host === '0.0.0.0' || data.host === '0.0.0.0' || data.host === '';
        const isOdpOrOlt = ['odp', 'olt'].includes(original.deviceType as any) || (data.deviceType && ['odp', 'olt'].includes(data.deviceType));
        const currentDeviceType = data.deviceType || original.deviceType;
        const currentIsAppOnly = data.isAppOnly !== undefined ? data.isAppOnly : original.isAppOnly;
        const isClientType = !isVirtualHost && !isOdpOrOlt && !currentIsAppOnly && (currentDeviceType === 'client' || currentDeviceType === 'router' || currentDeviceType === 'switch' || !currentDeviceType);

        if (isClientType && original.host && (data.host || data.interval || data.name !== undefined)) {
            const router = await this.findRouterWithPassword(routerId, tenantId);
            if (router) {
                let conn;
                try {
                    conn = await connectToRouter({
                        host: router.host,
                        port: router.port,
                        username: router.username,
                        password: router.password,
                    });

                    await updateNetwatchEntry(conn, original.host, {
                        host: data.host,
                        interval: data.interval,
                        comment: data.name,
                    });

                    if (router.useWebhook && router.webhookSecret && router.tenantId && !isOdpOrOlt) {
                        const webhookUrl = await settingsService.getWebhookUrl(router.webhookSecret, router.tenantId);
                        const hostToConfigure = data.host || original.host;
                        await configureNetwatchWebhook(conn, hostToConfigure, webhookUrl);
                    }
                } catch (err: any) {
                    const msg = err?.message || String(err);
                    logger.error({ err: msg, host: original.host }, 'Failed to update netwatch on router');
                    throw new Error(`Failed to update router: ${msg}`);
                } finally {
                    if (conn) conn.release();
                }
            }
        }

        const updateData: any = {
            updatedAt: new Date(),
        };

        if (data.host !== undefined) {
            updateData.host = data.host;
            if (data.host === '' || !data.host) {
                updateData.status = 'up';
            }
        }
        if (data.name !== undefined) updateData.name = data.name;
        if (data.deviceType !== undefined) updateData.deviceType = data.deviceType;
        if (data.interval !== undefined) updateData.interval = data.interval;
        if (data.latitude !== undefined) updateData.latitude = data.latitude === '' ? null : data.latitude;
        if (data.longitude !== undefined) updateData.longitude = data.longitude === '' ? null : data.longitude;
        if (data.location !== undefined) updateData.location = data.location;
        if (data.waypoints !== undefined) updateData.waypoints = data.waypoints;
        if (data.connectionType !== undefined) updateData.connectionType = data.connectionType;
        if (data.connectedToId !== undefined) updateData.connectedToId = data.connectedToId;
        if (data.targetInterface !== undefined) updateData.targetInterface = data.targetInterface;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.linkedOnuId !== undefined) updateData.linkedOnuId = data.linkedOnuId === '' ? null : data.linkedOnuId;

        const [netwatch] = await db
            .update(routerNetwatch)
            .set(updateData)
            .where(eq(routerNetwatch.id, netwatchId))
            .returning();

        if (netwatch) {
            eventEmitter.broadcast('map_update', {
                type: 'netwatch',
                id: netwatch.id,
                routerId: netwatch.routerId,
                action: 'update',
            });
        }

        if (data.name !== undefined || data.host !== undefined) {
            try {
                const topoUpdate: any = { updatedAt: new Date() };
                if (data.name !== undefined) topoUpdate.customName = data.name;
                if (data.host !== undefined) topoUpdate.customHost = data.host;
                await db.update(topologyNodes).set(topoUpdate)
                    .where(eq(topologyNodes.nodeId, netwatchId));
            } catch (err) {
                logger.error({ err, netwatchId }, 'Failed to sync netwatch update to topology');
            }
        }

        return netwatch;
    }

    /**
     * Delete a netwatch entry
     */
    async delete(routerId: string, netwatchId: string, tenantId?: string, deleteFromMikrotik: boolean = true): Promise<boolean> {
        logger.info({ netwatchId, routerId, deleteFromMikrotik }, '[RouterNetwatchService] Deleting netwatch entry');

        if (tenantId) {
            const routerCheck = await this.findRouterWithPassword(routerId, tenantId);
            if (!routerCheck) return false;
        }

        const [deleted] = await db
            .delete(routerNetwatch)
            .where(eq(routerNetwatch.id, netwatchId))
            .returning();

        if (deleted) {
            eventEmitter.broadcast('map_update', {
                type: 'netwatch',
                id: netwatchId,
                routerId,
                action: 'delete',
            });
        }

        if (!deleted) {
            logger.warn({ netwatchId }, '[RouterNetwatchService] Netwatch entry not found in DB for deletion');
            return false;
        }

        if (deleted.deviceType === 'client' || !deleted.deviceType) {
            if (deleteFromMikrotik && !deleted.isAppOnly) {
                const router = await this.findRouterWithPassword(routerId, tenantId);
                if (router) {
                    let conn;
                    try {
                        conn = await connectToRouter({
                            host: router.host,
                            port: router.port,
                            username: router.username,
                            password: router.password,
                        });

                        try {
                            await removeNetwatchEntry(conn, deleted.host);
                        } catch (netwatchErr: any) {
                            const msg = netwatchErr.message || '';
                            if (!msg.includes('no such item') && !msg.includes('not found')) {
                                logger.error({ err: msg }, '[RouterNetwatchService] Failed to remove from MikroTik');
                            }
                        }
                    } catch (err: any) {
                        logger.error({ err: err?.message || String(err) }, 'Failed to connect/delete netwatch from router');
                    } finally {
                        if (conn) conn.release();
                    }
                }
            }
        }

        try {
            await db.update(topologyNodes).set({ nodeId: null, updatedAt: new Date() })
                .where(eq(topologyNodes.nodeId, netwatchId));
        } catch (err) {
            logger.error({ err, netwatchId }, 'Failed to unlink topology nodes after netwatch delete');
        }

        return true;
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
     * Ensure an app-only netwatch entry exists for the given host.
     * If existingId is provided, it tries to update that entry instead of creating a new one.
     */
    async ensureAppOnlyEntry(routerId: string, host: string, name: string, type: string, tenantId?: string, existingId?: string | null): Promise<string> {
        // Validation: Host must be a valid IP or hostname (length > 3 and contains . or :)
        // This prevents partial strings from typing (e.g. "192.168.1") from creating junk entries
        const isLikelyPartial = !host || host === '0.0.0.0' || (host.length < 4) || (!host.includes('.') && !host.includes(':'));
        if (isLikelyPartial) {
            // If it's partial, we don't create/update netwatch, just return current if it exists
            if (existingId) return existingId;
            throw new Error('Invalid or partial host');
        }

        // 1. If we have a schematic reference ID, try to update it directly
        if (existingId) {
            const [existing] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, existingId));
            if (existing && existing.isAppOnly && existing.routerId === routerId) {
                const updatePayload: any = {
                    host,
                    name,
                    updatedAt: new Date()
                };

                if (type) {
                    let deviceType: any = 'client';
                    if (type === 'olt') deviceType = 'olt';
                    else if (type === 'router') deviceType = 'router';
                    else if (type === 'switch') deviceType = 'switch';
                    updatePayload.deviceType = deviceType;
                }

                await db.update(routerNetwatch).set(updatePayload).where(eq(routerNetwatch.id, existingId));
                return existingId;
            }
        }

        // 2. Otherwise, look for an entry with the same host on this router
        const [byHost] = await db.select()
            .from(routerNetwatch)
            .where(and(eq(routerNetwatch.routerId, routerId), eq(routerNetwatch.host, host)));

        if (byHost) {
            const updatePayload: any = { isAppOnly: true, updatedAt: new Date() };
            if (name && byHost.name !== name) {
                updatePayload.name = name;
            }
            await db.update(routerNetwatch).set(updatePayload).where(eq(routerNetwatch.id, byHost.id));
            return byHost.id;
        }

        // 3. Create new entry
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
