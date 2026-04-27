import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routers,
    routerMetrics,
    type Router,
} from '../db/schema/index.js';
import { logger } from '../lib/logger.js';
import {
    getRouterInfo,
    getRouterResources,
    getRouterInterfaces,
    getPppSessions,
    getSimpleQueues,
    isRouterosQuirk,
} from '../lib/mikrotik-api.js';
import { measureLatency } from '../lib/network-utils.js';
import { alertService } from './alert.service.js';
import { pppoeService } from './pppoe.service.js';
import { routerNetwatchService } from './router-netwatch.service.js';
import { routerMetricsService } from './router-metrics.service.js';
import { routerInterfaceService } from './router-interface.service.js';
import { eventEmitter } from './event-emitter.service.js';
import { routerActionService } from './router-action.service.js';

export class RouterSyncService {
    /**
     * Fetch and update router status and info
     * @param id Router ID
     * @param includeNetwatch If true, also sync netwatch entries in the same connection
     */
    async refreshRouterStatus(id: string, includeNetwatch: boolean = false, isFullSync: boolean = true, tenantId?: string): Promise<Router | undefined> {
        // We need a basic find to check initial status
        const [router] = await db.select().from(routers).where(eq(routers.id, id));
        if (!router) return undefined;

        // Skip synchronization if router is in maintenance mode
        if (router.status === 'maintenance' && !isFullSync) {
            logger.debug({ routerId: id, name: router.name }, '⏭️ Skipping background sync for router in maintenance mode');
            return router;
        }

        const previousStatus = router.status;

        let conn: any;
        try {
            conn = await routerActionService.getRouterConnection(id, tenantId);

            // Always fetch basic system info for identity/uptime check
            const info = await getRouterInfo(conn);

            // Only fetch heavy resources on full sync
            let resources = undefined;
            let interfaces = undefined;
            if (isFullSync) {
                resources = await getRouterResources(conn);
                interfaces = await getRouterInterfaces(conn);
            }

            let finalUpdatedRouter: Router | undefined;
 
            const latency = await measureLatency(router.host);

            // 1. PRIMARY UPDATE: Always mark as online if we've successfully connected and fetched info
            const [updatedRouter] = await db
                .update(routers)
                .set({
                    status: 'online',
                    lastSeen: new Date(),
                    latency: latency >= 0 ? latency : null,
                    routerOsVersion: info.version,
                    model: info.model,
                    serialNumber: info.serialNumber,
                    identity: info.identity,
                    boardName: info.boardName,
                    architecture: info.architecture,
                    lastErrorMessage: null, // Clear stale error messages
                    updatedAt: new Date(),
                })
                .where(eq(routers.id, id))
                .returning();

            finalUpdatedRouter = updatedRouter;

            // 2. STATUS CHANGE ALERT: Handle transition from offline to online
            if (previousStatus === 'offline') {
                await alertService.createStatusChangeAlert(id, router.name, previousStatus, 'online', undefined);
            }

            // 3. SECONDARY SYNC: Fetch and sync heavier resources (Netwatch, PPPoE, etc.)
            // We run these separately or with localized transactions to prevent long-lived row locks on the routers table.
            if (includeNetwatch || isFullSync) {
                // A. Netwatch Sync
                if (includeNetwatch) {
                    try {
                        const availableInterfaces = interfaces ? new Set(interfaces.map((i: any) => i.name)) : new Set<string>();
                        await routerNetwatchService.syncHosts(id, finalUpdatedRouter!.name, conn, availableInterfaces);
                        const syncedEntries = await routerNetwatchService.getNetwatch(id);
                        const targets = syncedEntries.filter((e: any) => e.host && e.host.length > 5 && e.host !== '0.0.0.0');
                        await routerNetwatchService.measureLatency(id, finalUpdatedRouter!.name, conn, targets);
                        
                        // Propagate to ONUs
                        await routerNetwatchService.propagateTraffic(id, finalUpdatedRouter!.name, conn);
                        await routerNetwatchService.syncToOnus(id);
                    } catch (netwatchErr) {
                        logger.error({ err: netwatchErr, router: finalUpdatedRouter!.name }, 'Degraded Mode: Netwatch/ONU synchronization failed');
                    }
                }

                // B. PPPoE & Queues Sync
                if (isFullSync) {
                    try {
                        // Track Sessions
                        const currentPppSessions = await getPppSessions(conn);
                        await pppoeService.trackSessions(finalUpdatedRouter, currentPppSessions);

                        // Simple Queues
                        const queues = await getSimpleQueues(conn);
                        await pppoeService.updateTraffic(id, queues);

                        // Per-client bandwidth deltas (Phase 1) — fire-and-forget,
                        // tidak boleh memblokir alur sinkronisasi utama.
                        try {
                            const { clientBandwidthService } = await import('./client-bandwidth.service.js');
                            await clientBandwidthService.record({
                                routerId: id,
                                tenantId: finalUpdatedRouter!.tenantId!,
                                pppActive: currentPppSessions,
                                simpleQueues: queues,
                            });
                        } catch (bwErr) {
                            logger.warn({ err: bwErr, router: finalUpdatedRouter!.name }, 'Client bandwidth tracking failed (non-fatal)');
                        }

                        // Metrics
                        if (resources) {
                            await routerMetricsService.saveMetrics(id, finalUpdatedRouter!.name, finalUpdatedRouter!.tenantId!, resources);
                        }

                        // Update lastFullSync timestamp ONLY on success
                        await db.update(routers).set({ lastFullSync: new Date() }).where(eq(routers.id, id));
                    } catch (pppoeErr) {
                        logger.error({ err: pppoeErr, router: finalUpdatedRouter!.name }, 'Degraded Mode: PPPoE/Metrics synchronization failed');
                    }
                }
            }

            // 4. INTERFACE SYNC: Update interfaces if they were fetched
            if (interfaces) {
                try {
                    let trafficMap: Map<string, { tx: number; rx: number }> | undefined;
                    if ((router.snmpStatus !== 'online' || !router.useSnmp) && isFullSync && interfaces.length > 0) {
                        const interfaceNames = interfaces.map((i: any) => i.name);
                        trafficMap = await routerActionService.getInterfaceTraffic(id, interfaceNames, tenantId);
                    }
                    await routerInterfaceService.syncInterfaces(id, interfaces, undefined, router.snmpStatus || undefined, trafficMap, router.useSnmp);
                } catch (intfErr) {
                    logger.error({ err: intfErr, router: router.name }, 'Degraded Mode: Interface synchronization failed');
                }
            }

            // Broadcast update to frontend (map and list)
            eventEmitter.broadcast('map_update', {
                type: 'router',
                id: id,
                action: 'update',
            });

            return finalUpdatedRouter;
        } catch (error: any) {
            if (isRouterosQuirk(error)) {
                logger.debug({ err: error?.message, router: router.host }, 'Ignoring RouterOS quirk during refresh');
                return undefined;
            }

            const errMsg = error?.message || String(error);
            
            // DIAGNOSTIC: Log the full raw error for every sync failure
            logger.warn({
                err: errMsg,
                errCode: error?.code || error?.errno,
                router: router.name,
                host: router.host,
                port: router.port,
                username: router.username,
                passwordPresent: !!router.passwordEncrypted,
                previousStatus,
            }, '🔍 [DIAG] Router sync failure - raw error details');

            // Reduced logging for persistent offline routers
            if (previousStatus === 'offline') {
                logger.debug({ err: errMsg, router: router.name, host: router.host }, 'Router still offline');
            } else {
                logger.error({ err: errMsg, router: router.host, name: router.name }, 'Connection failed during refresh');
            }

            // Classify the error with human readable messages
            let friendlyError = 'API Error';
            const lowErrMsg = errMsg.toLowerCase();

            // Prevent false positives: if the error is a database query failure, 
            // the raw SQL might contain the column name "password_encrypted", but it's not a MikroTik login failure.
            const isDbError = lowErrMsg.includes('failed query:');

            if (!isDbError && (lowErrMsg.includes('login failure') || lowErrMsg.includes('invalid') || lowErrMsg.includes('password'))) {
                logger.error({ rawError: errMsg }, '🚨 [DIAG] Error classified as Salah Password');
                friendlyError = 'Salah Password / Username';
            } else if (!isDbError && (lowErrMsg.includes('timeout') || lowErrMsg.includes('etimedout') || lowErrMsg.includes('timed out after'))) {
                friendlyError = 'Connection Timeout / Busy';
            } else if (!isDbError && lowErrMsg.includes('econnrefused')) {
                friendlyError = 'Connection Refused (API Service Off?)';
            } else if (!isDbError && (lowErrMsg.includes('ehostunreach') || lowErrMsg.includes('cannot connect') || lowErrMsg.includes('enotfound') || lowErrMsg.includes('eai_again'))) {
                friendlyError = 'Mikrotik Mati / DNS Error / Unreachable';
            } else if (!isDbError && (lowErrMsg.includes('econnreset') || lowErrMsg.includes('epipe') || lowErrMsg.includes('socket hang up'))) {
                friendlyError = 'API Terputus (Connection Reset)';
            } else if (!isDbError && (lowErrMsg.includes('network') || lowErrMsg.includes('unreachable'))) {
                friendlyError = 'Network Issue / Unreachable';
            } else if (isDbError) {
                // Include specific Postgres detail in the database error message for better diagnostics.
                const pgDetail = errMsg.split('\n')[0].replace('Failed query:', '').trim();
                friendlyError = `Database Update Error${pgDetail ? ': ' + pgDetail.substring(0, 30) : ' during Sync'}`;
            } else {
                friendlyError = `API Error: ${errMsg.substring(0, 50)}${errMsg.length > 50 ? '...' : ''}`;
            }

            const [updatedRouter] = await db
                .update(routers)
                .set({
                    status: 'offline',
                    lastErrorMessage: friendlyError,
                    updatedAt: new Date(),
                })
                .where(eq(routers.id, id))
                .returning();

            if (previousStatus === 'online') {
                try {
                    await alertService.createStatusChangeAlert(
                        id,
                        router.name,
                        previousStatus,
                        'offline',
                        friendlyError
                    );
                } catch (alertError: any) {
                    logger.error({ err: alertError?.message || String(alertError) }, 'Failed to create offline alert');
                }
            }

            eventEmitter.broadcast('map_update', {
                type: 'router',
                id: id,
                action: 'update',
            });

            return updatedRouter;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Measure latency for all netwatch hosts on a router
     */
    async measureNetwatchLatency(id: string, customConn?: any): Promise<void> {
        if (customConn) {
            const [router] = await db.select().from(routers).where(eq(routers.id, id));
            const entries = await routerNetwatchService.getNetwatch(id);
            const targets = entries.filter(e => e.host && e.host.length > 5 && e.host !== '0.0.0.0');
            return routerNetwatchService.measureLatency(id, router?.name || 'Unknown', customConn, targets);
        }

        const [router] = await db.select().from(routers).where(eq(routers.id, id));
        if (!router) return;

        let conn;
        try {
            conn = await routerActionService.getRouterConnection(id);
            const entries = await routerNetwatchService.getNetwatch(id);
            const targets = entries.filter(e => e.host && e.host.length > 5 && e.host !== '0.0.0.0');
            await routerNetwatchService.measureLatency(id, router.name, conn, targets);
        } catch (err) {
            logger.error({ err, router: router.name }, 'Failed to measure netwatch latency');
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Sync netwatch entries from MikroTik router to database
     */
    async syncNetwatchFromRouter(id: string): Promise<{ synced: number; errors: string[] }> {
        return routerNetwatchService.fullSync(id);
    }

    /**
     * UNIFIED LINKAGE: Sync Netwatch bridging to ONUS table
     */
    async syncToOnus(id: string): Promise<void> {
        return routerNetwatchService.syncToOnus(id);
    }
}

export const routerSyncService = new RouterSyncService();
