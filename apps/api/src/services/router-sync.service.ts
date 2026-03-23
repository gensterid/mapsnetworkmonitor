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

            await db.transaction(async (tx) => {
                // Fetch and sync netwatch in the same connection if requested
                if (includeNetwatch) {
                    // 1. Sync hosts (Netwatch list)
                    const availableInterfaces = interfaces ? new Set(interfaces.map((i: any) => i.name)) : new Set<string>();
                    await routerNetwatchService.syncHosts(id, router.name, conn, availableInterfaces, tx);
 
                    // 2. Measure latency for synced hosts
                    const syncedEntries = await routerNetwatchService.getNetwatch(id, tx);
                    // Filter targets for ping
                    const targets = syncedEntries.filter((e: any) => e.host && e.host.length > 5 && e.host !== '0.0.0.0');
                    await routerNetwatchService.measureLatency(id, router.name, conn, targets, tx);
 
                    // 3. Track PPPoE sessions
                    try {
                        const currentPppSessions = await getPppSessions(conn);
                        await pppoeService.trackSessions(id, router.name, currentPppSessions, tx);
                    } catch (pppoeError) {
                        logger.error({ err: pppoeError, router: router.name }, 'Failed to track PPPoE sessions');
                    }
 
                    // 4. Fetch Simple Queues for Heatmap Traffic
                    try {
                        const queues = await getSimpleQueues(conn);
                        await pppoeService.updateTraffic(id, queues, tx);
                    } catch (qErr) {
                        logger.error({ err: qErr, router: router.name }, 'Failed to sync queues');
                    }
 
                    // 5. Propagate Interface Traffic
                    await routerNetwatchService.propagateTraffic(id, router.name, conn, tx);
 
                    // 6. Sync Netwatch Status to ONUs (Bridging)
                    await routerNetwatchService.syncToOnus(id, tx);
                }


                // Update router info
                const [updatedRouter] = await tx
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
                        lastErrorMessage: null, // Clear stale error messages on success
                        updatedAt: new Date(),
                        ...(isFullSync ? { lastFullSync: new Date() } : {}),
                    })
                    .where(eq(routers.id, id))
                    .returning();
 
                finalUpdatedRouter = updatedRouter;
 
                // Create alert if status changed from offline to online
                if (previousStatus === 'offline') {
                    await alertService.createStatusChangeAlert(
                        id,
                        router.name,
                        previousStatus,
                        'online',
                        undefined,
                        tx
                    );
                }

                // Save metrics only if resources are available (Full Sync)
                if (resources) {
                    await routerMetricsService.saveMetrics(id, router.name, router.tenantId!, resources, tx);
                }

                // Update interfaces
                if (interfaces) {
                    let trafficMap: Map<string, { tx: number, rx: number }> | undefined;
                    
                    // FETCH REAL-TIME TRAFFIC: If SNMP is not primary (or disabled), fetch rates via API monitor-traffic
                    // to ensure accurate history and prevent spikes from counter resets.
                    if ((router.snmpStatus !== 'online' || !router.useSnmp) && isFullSync && interfaces.length > 0) {
                        try {
                            const interfaceNames = interfaces.map((i: any) => i.name);
                            trafficMap = await routerActionService.getInterfaceTraffic(id, interfaceNames, tenantId);
                        } catch (err) {
                            logger.warn({ err: String(err), router: router.name }, 'Failed to fetch real-time traffic during sync');
                        }
                    }

                    await routerInterfaceService.syncInterfaces(id, interfaces, tx, router.snmpStatus || undefined, trafficMap, router.useSnmp);
                }
            });

            return finalUpdatedRouter;
        } catch (error: any) {
            if (isRouterosQuirk(error)) {
                logger.debug({ err: error?.message, router: router.host }, 'Ignoring RouterOS quirk during refresh');
                return undefined;
            }

            const errMsg = error?.message || String(error);
            
            // Reduced logging for persistent offline routers
            if (previousStatus === 'offline') {
                logger.debug({ err: errMsg, router: router.name, host: router.host }, 'Router still offline');
            } else {
                logger.error({ err: errMsg, router: router.host, name: router.name }, 'Connection failed during refresh');
            }

            // Classify the error with human readable messages
            let friendlyError = 'API Error';
            const lowErrMsg = errMsg.toLowerCase();

            if (lowErrMsg.includes('login failure') || lowErrMsg.includes('invalid') || lowErrMsg.includes('password')) {
                friendlyError = 'Salah Password / Username';
            } else if (lowErrMsg.includes('timeout') || lowErrMsg.includes('etimedout') || lowErrMsg.includes('timed out after')) {
                friendlyError = 'Connection Timeout / Busy';
            } else if (lowErrMsg.includes('econnrefused')) {
                friendlyError = 'Connection Refused (API Service Off?)';
            } else if (lowErrMsg.includes('ehostunreach') || lowErrMsg.includes('cannot connect') || lowErrMsg.includes('enotfound') || lowErrMsg.includes('eai_again')) {
                friendlyError = 'Mikrotik Mati / DNS Error / Unreachable';
            } else if (lowErrMsg.includes('econnreset') || lowErrMsg.includes('epipe') || lowErrMsg.includes('socket hang up')) {
                friendlyError = 'API Terputus (Connection Reset)';
            } else if (lowErrMsg.includes('network') || lowErrMsg.includes('unreachable')) {
                friendlyError = 'Network Issue / Unreachable';
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
    async measureNetwatchLatency(routerId: string, customConn?: any): Promise<void> {
        if (customConn) {
            const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
            const entries = await routerNetwatchService.getNetwatch(routerId);
            const targets = entries.filter(e => e.host && e.host.length > 5 && e.host !== '0.0.0.0');
            return routerNetwatchService.measureLatency(routerId, router?.name || 'Unknown', customConn, targets);
        }

        const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
        if (!router) return;

        let conn;
        try {
            conn = await routerActionService.getRouterConnection(routerId);
            const entries = await routerNetwatchService.getNetwatch(routerId);
            const targets = entries.filter(e => e.host && e.host.length > 5 && e.host !== '0.0.0.0');
            await routerNetwatchService.measureLatency(routerId, router.name, conn, targets);
        } catch (err) {
            logger.error({ err, router: router.name }, 'Failed to measure netwatch latency');
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Sync netwatch entries from MikroTik router to database
     */
    async syncNetwatchFromRouter(routerId: string): Promise<{ synced: number; errors: string[] }> {
        return routerNetwatchService.fullSync(routerId);
    }

    /**
     * UNIFIED LINKAGE: Sync Netwatch bridging to ONUS table
     */
    async syncToOnus(routerId: string): Promise<void> {
        return routerNetwatchService.syncToOnus(routerId);
    }
}

export const routerSyncService = new RouterSyncService();
