import { eq, desc, and, or, getTableColumns, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routers,
    routerInterfaces,
    routerMetrics,
    routerNetwatch,
    alerts,
    type Router,
    type RouterInterface,
    type RouterMetric,
    type RouterNetwatch,
    userRouters,
    onus,
} from '../db/schema/index.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';
import {
    connectToRouter,
    getRouterInfo,
    getRouterResources,
    getRouterInterfaces,
    getRouterClock,
    testConnection,
    rebootRouter,
    getHotspotActive,
    getPppActive,
    getPppSessions,
    getSimpleQueues,
    addNetwatchEntry,
    updateNetwatchEntry,
    removeNetwatchEntry,
    measurePing,
    getInterfaceTraffic,
    type RouterConnection,
    type PppSession,
} from '../lib/mikrotik-api.js';
import { measureLatency } from '../lib/network-utils.js';
import { alertService } from './alert.service.js';
import { pppoeService } from './pppoe.service.js';
import { settingsService } from './settings.service.js';
import { snmpService } from './snmp.service.js';
import { routerNetwatchService } from './router-netwatch.service.js';
import { routerMetricsService } from './router-metrics.service.js';
import { routerInterfaceService } from './router-interface.service.js';

export interface CreateRouterInput {
    name: string;
    host: string;
    port?: number;
    username: string;
    password: string; // Plain text password
    latitude?: string;
    longitude?: string;
    location?: string;
    locationImage?: string;
    groupId?: string;
    notificationGroupId?: string | null;
    notes?: string;
    snmpCommunity?: string;
    snmpPort?: number;
    useGenieAcs?: boolean;
    genieacsUrl?: string | null;
    genieacsUsername?: string | null;
    genieacsPassword?: string | null;
}

export interface UpdateRouterInput {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string; // Plain text password (only if updating)
    latitude?: string;
    longitude?: string;
    location?: string;
    locationImage?: string | null;
    groupId?: string | null;
    notificationGroupId?: string | null;
    notes?: string;
    snmpCommunity?: string;
    snmpPort?: number;
    useGenieAcs?: boolean;
    genieacsUrl?: string | null;
    genieacsUsername?: string | null;
    genieacsPassword?: string | null;
    status?: 'online' | 'offline' | 'maintenance' | 'unknown';
}

/**
 * Router Service - handles router CRUD and monitoring operations
 */
export class RouterService {
    /**
     * Get all routers with their latest metrics and fastest interface speed
     */
    async findAll(
        userId?: string,
        userRole?: string
    ): Promise<(Router & { latestMetrics?: RouterMetric; maxInterfaceSpeed?: string })[]> {
        let query = db.select().from(routers).orderBy(routers.name).$dynamic();

        // If user is not admin, filter by assigned routers
        if (userId && userRole && userRole !== 'admin') {
            // Get assigned router IDs
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return []; // No routers assigned
            }

            // Filter routers
            // Note: In Drizzle, using `inArray` is needed
            const { inArray } = await import('drizzle-orm');
            query = db
                .select()
                .from(routers)
                .where(inArray(routers.id, routerIds))
                .orderBy(routers.name)
                .$dynamic();
        }

        const allRouters = await query;

        // Fetch latest metrics and interfaces for each router
        const routersWithData = await Promise.all(
            allRouters.map(async (router) => {
                // Get latest metrics
                const [latestMetric] = await db
                    .select()
                    .from(routerMetrics)
                    .where(eq(routerMetrics.routerId, router.id))
                    .orderBy(desc(routerMetrics.recordedAt))
                    .limit(1);

                // Get interfaces to find max speed
                const interfaces = await db
                    .select()
                    .from(routerInterfaces)
                    .where(eq(routerInterfaces.routerId, router.id));

                // Find the max interface speed
                let maxInterfaceSpeed: string | undefined;
                for (const iface of interfaces) {
                    if (iface.speed && iface.running) {
                        if (!maxInterfaceSpeed ||
                            this.parseSpeed(iface.speed) > this.parseSpeed(maxInterfaceSpeed)) {
                            maxInterfaceSpeed = iface.speed;
                        }
                    }
                }

                return { ...router, latestMetrics: latestMetric, maxInterfaceSpeed };
            })
        );

        return routersWithData;
    }

    /**
     * Check if a user has access to a specific router
     */
    async hasAccess(userId: string, userRole: string, routerId: string): Promise<boolean> {
        if (userRole === 'admin') return true;
        if (!userId) return false;

        const { userRouters } = await import('../db/schema/index.js');
        const [assignment] = await db
            .select()
            .from(userRouters)
            .where(and(
                eq(userRouters.userId, userId),
                eq(userRouters.routerId, routerId)
            ));

        return !!assignment;
    }

    /**
     * Parse speed string to number for comparison (e.g., "1Gbps" -> 1000, "100Mbps" -> 100)
     */
    private parseSpeed(speed: string): number {
        const match = speed.match(/(\d+)\s*(G|M)/i);
        if (!match) return 0;
        const value = parseInt(match[1], 10);
        const unit = match[2].toUpperCase();
        return unit === 'G' ? value * 1000 : value;
    }

    /**
     * Get router by ID
     */
    async findById(id: string): Promise<Router | undefined> {
        const [router] = await db.select().from(routers).where(eq(routers.id, id));
        return router;
    }

    /**
     * Get router by ID with decrypted password (for internal use)
     */
    async findByIdWithPassword(
        id: string
    ): Promise<(Router & { password: string }) | undefined> {
        const router = await this.findById(id);
        if (!router) return undefined;

        return {
            ...router,
            password: decrypt(router.passwordEncrypted),
        };
    }

    /**
     * Create a new router
     */
    async create(data: CreateRouterInput): Promise<Router> {
        const encryptedPassword = encrypt(data.password);

        const [router] = await db
            .insert(routers)
            .values({
                name: data.name,
                host: data.host,
                port: data.port || 8728,
                username: data.username,
                passwordEncrypted: encryptedPassword,
                latitude: data.latitude,
                longitude: data.longitude,
                location: data.location,
                locationImage: data.locationImage,
                groupId: data.groupId,
                notificationGroupId: data.notificationGroupId,
                notes: data.notes,
                snmpCommunity: data.snmpCommunity,
                snmpPort: data.snmpPort,
                useGenieAcs: data.useGenieAcs || false,
                genieacsUrl: data.genieacsUrl,
                genieacsUsername: data.genieacsUsername,
                genieacsPasswordEncrypted: data.genieacsPassword ? encrypt(data.genieacsPassword) : null,
                status: 'unknown',
            })
            .returning();

        return router;
    }

    /**
     * Update router
     */
    async update(id: string, data: UpdateRouterInput): Promise<Router | undefined> {
        const updateData: Partial<typeof routers.$inferInsert> & { updatedAt: Date } = {
            updatedAt: new Date(),
        };

        if (data.name !== undefined) updateData.name = data.name;
        if (data.host !== undefined) updateData.host = data.host;
        if (data.port !== undefined) updateData.port = data.port;
        if (data.username !== undefined) updateData.username = data.username;
        if (data.password !== undefined) {
            updateData.passwordEncrypted = encrypt(data.password);
        }
        if (data.latitude !== undefined) updateData.latitude = data.latitude;
        if (data.longitude !== undefined) updateData.longitude = data.longitude;
        if (data.location !== undefined) updateData.location = data.location;
        if (data.locationImage !== undefined)
            updateData.locationImage = data.locationImage;
        if (data.groupId !== undefined) updateData.groupId = data.groupId;
        if (data.notificationGroupId !== undefined)
            updateData.notificationGroupId = data.notificationGroupId;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.snmpCommunity !== undefined) updateData.snmpCommunity = data.snmpCommunity;
        if (data.snmpPort !== undefined) updateData.snmpPort = data.snmpPort;
        if (data.useGenieAcs !== undefined) updateData.useGenieAcs = data.useGenieAcs;
        if (data.genieacsUrl !== undefined) updateData.genieacsUrl = data.genieacsUrl;
        if (data.genieacsUsername !== undefined) updateData.genieacsUsername = data.genieacsUsername;
        if (data.genieacsPassword !== undefined) {
            updateData.genieacsPasswordEncrypted = data.genieacsPassword ? encrypt(data.genieacsPassword) : null;
        }
        if (data.status !== undefined) updateData.status = data.status;

        const [router] = await db
            .update(routers)
            .set(updateData)
            .where(eq(routers.id, id))
            .returning();

        return router;
    }

    /**
     * Delete router
     */
    async delete(id: string): Promise<boolean> {
        const result = await db.delete(routers).where(eq(routers.id, id)).returning();
        return result.length > 0;
    }

    /**
     * Test connection to a router
     */
    async testConnection(
        id: string
    ): Promise<{ success: boolean; info?: unknown; error?: string }> {
        const router = await this.findByIdWithPassword(id);
        if (!router) {
            return { success: false, error: 'Router not found' };
        }

        const config: RouterConnection = {
            host: router.host,
            port: router.port,
            username: router.username,
            password: router.password,
        };

        return testConnection(config);
    }

    /**
     * Test connection with credentials (for testing before save)
     */
    async testConnectionWithCredentials(
        host: string,
        port: number,
        username: string,
        password: string
    ): Promise<{ success: boolean; info?: unknown; error?: string }> {
        return testConnection({ host, port, username, password });
    }

    /**
     * Fetch and update router status and info
     * @param id Router ID
     * @param includeNetwatch If true, also sync netwatch entries in the same connection
     */
    async refreshRouterStatus(id: string, includeNetwatch: boolean = false, isFullSync: boolean = true): Promise<Router | undefined> {
        const router = await this.findByIdWithPassword(id);
        if (!router) return undefined;

        const previousStatus = router.status;

        let conn: any;
        try {
            conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: router.password,
            });

            // Always fetch basic system info for identity/uptime check
            const info = await getRouterInfo(conn);

            // Only fetch heavy resources on full sync
            let resources = undefined;
            let interfaces = undefined;
            if (isFullSync) {
                resources = await getRouterResources(conn);
                interfaces = await getRouterInterfaces(conn);
            }

            // Fetch and sync netwatch in the same connection if requested
            if (includeNetwatch) {
                // 1. Sync hosts (Netwatch list)
                const availableInterfaces = new Set(interfaces?.map(i => i.name) || []);
                await routerNetwatchService.syncHosts(id, router.name, conn, availableInterfaces);

                // 2. Measure latency for synced hosts
                const syncedEntries = await routerNetwatchService.getNetwatch(id);
                // Filter targets for ping
                const targets = syncedEntries.filter(e => e.host && e.host.length > 5 && e.host !== '0.0.0.0');
                await routerNetwatchService.measureLatency(id, router.name, conn, targets);

                // 3. Track PPPoE sessions
                try {
                    const currentPppSessions = await getPppSessions(conn);
                    await pppoeService.trackSessions(id, router.name, currentPppSessions);
                } catch (pppoeError) {
                    console.error(`[Router ${router.name}] Failed to track PPPoE sessions:`, pppoeError);
                }

                // 4. Fetch Simple Queues for Heatmap Traffic
                try {
                    const queues = await getSimpleQueues(conn);
                    await pppoeService.updateTraffic(id, queues);
                } catch (qErr) {
                    console.error(`[Router ${router.name}] Failed to sync queues:`, qErr);
                }

                // 5. Propagate Interface Traffic
                await routerNetwatchService.propagateTraffic(id, router.name, conn);

                // 6. Sync Netwatch Status to ONUs (Bridging)
                await routerNetwatchService.syncToOnus(id);
            }



            const latency = await measureLatency(router.host);

            // Update router info
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
                    updatedAt: new Date(),
                })
                .where(eq(routers.id, id))
                .returning();

            // Create alert if status changed from status to online
            if (previousStatus === 'offline') {
                await alertService.createStatusChangeAlert(
                    id,
                    router.name,
                    previousStatus,
                    'online'
                );
            }

            // Save metrics only if resources are available (Full Sync)
            if (resources) {
                await routerMetricsService.saveMetrics(id, router.name, resources);
            }



            // Update interfaces
            if (interfaces) {
                await routerInterfaceService.syncInterfaces(id, interfaces);
            }

            return updatedRouter;
        } catch (error) {
            console.error(`[Router ${router.host}] Connection failed:`, error instanceof Error ? error.message : error);

            // Only mark offline if it's a connection error
            // Check if error is ETIMEDOUT, ECONNREFUSED, or login failure
            const errMsg = error instanceof Error ? error.message : String(error);
            const isConnectionError =
                errMsg.includes('timeout') ||
                errMsg.includes('ECONNREFUSED') ||
                errMsg.includes('EHOSTUNREACH') ||
                errMsg.includes('login failure') ||
                errMsg.includes('cannot connect');

            if (isConnectionError) {

                const [updatedRouter] = await db
                    .update(routers)
                    .set({
                        status: 'offline',
                        updatedAt: new Date(),
                    })
                    .where(eq(routers.id, id))
                    .returning();

                // Create alert if status changed from online to offline
                if (previousStatus === 'online') {
                    try {
                        await alertService.createStatusChangeAlert(
                            id,
                            router.name,
                            previousStatus,
                            'offline'
                        );
                    } catch (alertError) {
                        console.error('Failed to create offline alert:', alertError);
                    }
                }
                return updatedRouter;
            } else {
                // If it's NOT a connection error (e.g. metrics parsing failed), 
                // keep previous status or mark online?
                // Better to throw so we see the error, but don't mark offline.
                // Or just log it.
                console.error(`[Router ${router.host}] Non-connection error during refresh:`, error);
                return router;
            }
        } finally {
            if (conn) {
                try {
                    await conn.close();
                } catch (closeErr) {
                    console.error(`[Router ${router.host}] Failed to close connection in finally block:`, closeErr);
                }
            }
        }
    }

    /**
     * Reboot a router
     */
    async reboot(id: string): Promise<{ success: boolean; error?: string }> {
        const router = await this.findByIdWithPassword(id);
        if (!router) {
            return { success: false, error: 'Router not found' };
        }

        try {
            const conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: router.password,
            });

            await rebootRouter(conn);
            conn.close();

            // Update router status
            await db
                .update(routers)
                .set({
                    status: 'offline',
                    updatedAt: new Date(),
                })
                .where(eq(routers.id, id));

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Get router interfaces
     */
    async getInterfaces(routerId: string): Promise<RouterInterface[]> {
        return routerInterfaceService.getInterfaces(routerId);
    }

    /**
     * Get router metrics (latest)
     */
    /**
     * Get router metrics (latest)
     */
    async getLatestMetrics(routerId: string): Promise<RouterMetric | undefined> {
        const [metric] = await db
            .select()
            .from(routerMetrics)
            .where(eq(routerMetrics.routerId, routerId))
            .orderBy(desc(routerMetrics.recordedAt))
            .limit(1);
        return metric;
    }

    /**
     * Get active hotspot users count
     */
    async getHotspotActive(routerId: string): Promise<number> {
        const router = await this.findByIdWithPassword(routerId);
        if (!router) throw new Error('Router not found');

        try {
            const conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: router.password,
            });

            const count = await getHotspotActive(conn);
            conn.close();
            return count;
        } catch (error) {
            console.error(`Failed to get hotspot users for ${router.host}:`, error);
            return 0;
        }
    }

    /**
     * Get active PPP connections count
     */
    async getPppActive(routerId: string): Promise<number> {
        const router = await this.findByIdWithPassword(routerId);
        if (!router) throw new Error('Router not found');

        try {
            const conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: router.password,
            });

            const count = await getPppActive(conn);
            conn.close();
            return count;
        } catch (error) {
            console.error(`Failed to get PPP users for ${router.host}:`, error);
            return 0;
        }
    }

    /**
     * Get active PPP sessions with details
     */
    async getPppSessions(routerId: string): Promise<PppSession[]> {
        const router = await this.findByIdWithPassword(routerId);
        if (!router) throw new Error('Router not found');

        try {
            const conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: router.password,
            });

            const sessions = await getPppSessions(conn);
            conn.close();
            return sessions;
        } catch (error) {
            console.error(`Failed to get PPP sessions for ${router.host}:`, error);
            return [];
        }
    }

    /**
     * Get router metrics history
     */
    async getMetricsHistory(
        routerId: string,
        limit = 100
    ): Promise<RouterMetric[]> {
        return routerMetricsService.getMetricsHistory(routerId, limit);
    }

    /**
     * Get real-time traffic using SNMP (faster/lighter than API)
     */
    async getSnmpTraffic(routerId: string): Promise<Record<string, { tx: number; rx: number }>> {
        const router = await this.findById(routerId);
        if (!router) return {};
        return routerMetricsService.getSnmpTraffic(router);
    }

    /**
     * Count routers by status
     */
    async countByStatus(): Promise<{
        total: number;
        online: number;
        offline: number;
        maintenance: number;
        unknown: number;
    }> {
        const allRouters = await db.select().from(routers);

        return {
            total: allRouters.length,
            online: allRouters.filter((r) => r.status === 'online').length,
            offline: allRouters.filter((r) => r.status === 'offline').length,
            maintenance: allRouters.filter((r) => r.status === 'maintenance').length,
            unknown: allRouters.filter((r) => r.status === 'unknown').length,
        };
    }

    /**
     * Measure ping latency to configured targets via MikroTik router
     * Returns array of { ip, label, latency } objects
     */
    async measurePingTargets(routerId: string): Promise<{ ip: string; label: string; latency: number | null; packetLoss: number | null }[]> {
        const router = await this.findByIdWithPassword(routerId);
        if (!router || router.status !== 'online') {
            return [];
        }

        // Get configured ping targets from settings
        const defaultTargets = [
            { ip: '8.8.8.8', label: 'Google DNS' },
            { ip: '1.1.1.1', label: 'Cloudflare' }
        ];

        const targetsValue = await settingsService.getSettingValue<Array<{ ip: string; label: string }>>('pingTargets', defaultTargets);
        const targets = Array.isArray(targetsValue) ? targetsValue : defaultTargets;

        if (targets.length === 0) {
            return [];
        }

        let conn: any;
        const results: { ip: string; label: string; latency: number | null; packetLoss: number | null }[] = [];

        try {
            logger.info({ router: router.name, targets: targets.map(t => t.ip) }, 'Connecting to measure ping targets');
            conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: router.password,
                timeout: 15 // Sufficient timeout for internet ping
            });

            // Ping each target (sequentially to avoid overwhelming router)
            for (const target of targets.slice(0, 6)) { // Max 6 targets
                try {
                    // Use relaxed interval (500ms) and longer timeout (2000ms) for high latency internet targets
                    const { latency, packetLoss } = await measurePing(conn, target.ip, 3, '500ms', '2000ms');
                    results.push({
                        ip: target.ip,
                        label: target.label || target.ip,
                        latency: latency >= 0 ? latency : null,
                        packetLoss: packetLoss
                    });
                } catch (err) {
                    console.error(`[Router ${router.name}] Error pinging ${target.ip}:`, err);
                    results.push({
                        ip: target.ip,
                        label: target.label || target.ip,
                        latency: null,
                        packetLoss: null
                    });
                }
            }
        } catch (error) {
            console.error(`[Router ${router.name}] Failed to measure ping targets completely:`, error instanceof Error ? error.message : error);

            // If connection failed, return targets with null results instead of 500
            if (results.length === 0) {
                return targets.slice(0, 6).map(t => ({
                    ip: t.ip,
                    label: t.label || t.ip,
                    latency: null,
                    packetLoss: null
                }));
            }
        } finally {
            if (conn) {
                try {
                    await conn.close();
                } catch (e) {
                    // Ignore close error
                }
            }
        }

        return results;
    }

    // ==================== NETWATCH METHODS ====================

    /**
     * Get all netwatch entries for a router
     */
    async getNetwatch(routerId: string): Promise<any[]> {
        return routerNetwatchService.getNetwatch(routerId);
    }

    /**
     * Get all netwatch entries for all accessible routers
     */
    async getNetwatchAll(routerIds: string[]): Promise<any[]> {
        return routerNetwatchService.getNetwatchAll(routerIds);
    }

    /**
     * Create a netwatch entry
     */
    /**
     * Create a netwatch entry
     */
    /**
     * Create a netwatch entry
     */
    async createNetwatch(
        routerId: string,
        data: {
            host?: string; // Optional for ODP devices
            name?: string;
            deviceType?: 'client' | 'olt' | 'odp';
            interval?: number;
            latitude?: string;
            longitude?: string;
            location?: string;
            waypoints?: string; // JSON string of coordinates
            connectionType?: 'router' | 'client';
            connectedToId?: string | null;
            targetInterface?: string | null;
        }
    ): Promise<RouterNetwatch> {
        // 1. Apply to Router first (only for client type with host)
        const router = await this.findByIdWithPassword(routerId);
        if (!router) throw new Error('Router not found');

        // Only add to MikroTik if it's a netwatch client type (has IP to ping)
        if ((data.deviceType === 'client' || !data.deviceType) && data.host) {
            let conn;
            try {
                conn = await connectToRouter({
                    host: router.host,
                    port: router.port,
                    username: router.username,
                    password: router.password,
                });

                await addNetwatchEntry(conn, {
                    host: data.host,
                    interval: data.interval,
                    comment: data.name, // Mapping name to comment
                });
            } catch (err) {
                console.error('Failed to add netwatch to router:', err);
                throw new Error(`Failed to add to router: ${err instanceof Error ? err.message : 'Unknown error'}`);
            } finally {
                if (conn) await conn.close().catch(console.error);
            }
        }

        // 2. Insert into DB
        const [netwatch] = await db
            .insert(routerNetwatch)
            .values({
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
                targetInterface: data.targetInterface, // New field for heatmap mapping
                status: data.host ? 'unknown' : 'up', // ODP without host is always "up"
            })
            .returning();

        return netwatch;
    }

    /**
     * Update a netwatch entry
     */
    async updateNetwatch(
        routerId: string,
        netwatchId: string,
        data: {
            host?: string;
            name?: string;
            deviceType?: 'client' | 'olt' | 'odp';
            interval?: number;
            latitude?: string;
            longitude?: string;
            location?: string | null;
            waypoints?: string | null; // JSON string of coordinates
            connectionType?: 'router' | 'client';
            connectedToId?: string | null;
            targetInterface?: string | null;
            status?: 'up' | 'down' | 'unknown';
            linkedOnuId?: string | null;
        }
    ): Promise<RouterNetwatch | undefined> {
        // 0. Get original entry to know the host
        const [original] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, netwatchId));
        if (!original) throw new Error('Netwatch entry not found');

        // 1. Apply to Router (only for client types and only if relevant fields change)
        // OLT/ODP don't need to be added to MikroTik netwatch
        // STRICT CHECK: Skip if host is 0.0.0.0 (Virtual device) or empty
        const isVirtualHost = original.host === '0.0.0.0' || data.host === '0.0.0.0' || data.host === '';
        const isOdpOrOlt = original.deviceType === 'odp' || original.deviceType === 'olt' || data.deviceType === 'odp' || data.deviceType === 'olt';
        const isClientType = !isVirtualHost && !isOdpOrOlt && (original.deviceType === 'client' || !original.deviceType);

        // Only update MikroTik for client types with valid host
        if (isClientType && original.host && (data.host || data.interval || data.name !== undefined)) {
            const router = await this.findByIdWithPassword(routerId);
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
                } catch (err) {
                    console.error('Failed to update netwatch on router:', err);
                    // Log more details if available
                    if (typeof err === 'object' && err !== null) {
                        console.error('Error details:', JSON.stringify(err, null, 2));
                    }
                    throw new Error(`Failed to update router: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
                } finally {
                    if (conn) await conn.close().catch(console.error);
                }
            }
        }

        const updateData: Partial<typeof routerNetwatch.$inferInsert> & { updatedAt: Date } = {
            updatedAt: new Date(),
        };

        if (data.host !== undefined) {
            updateData.host = data.host;
            // If host is cleared, automatically set status to 'up' so it doesn't appear in down list
            if (data.host === '' || !data.host) {
                updateData.status = 'up';
            }
        }
        if (data.name !== undefined) updateData.name = data.name;
        if (data.deviceType !== undefined) updateData.deviceType = data.deviceType;
        if (data.interval !== undefined) updateData.interval = data.interval;
        // Convert empty strings to null for numeric fields (Postgres decimal/numeric can't accept empty string)
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

        return netwatch;
    }

    /**
     * Delete a netwatch entry
     */
    async deleteNetwatch(routerId: string, netwatchId: string): Promise<boolean> {
        logger.info({ netwatchId, routerId }, '[RouterService] Deleting netwatch entry');

        // 1. Delete from DB first and get the deleted entry
        // This ensures that even if router connection fails, the item is removed from DB/Map
        const [deleted] = await db
            .delete(routerNetwatch)
            .where(eq(routerNetwatch.id, netwatchId))
            .returning();

        if (!deleted) {
            console.warn(`[RouterService] Netwatch entry not found in DB for deletion: ${netwatchId}`);
            return false;
        }

        logger.info({ host: deleted.host, deviceType: deleted.deviceType }, '[RouterService] Deleted netwatch from DB');

        // 2. Apply to Router (only for client types)
        // OLT/ODP are not stored in MikroTik Netwatch
        const isClientType = deleted.deviceType === 'client' || !deleted.deviceType;
        if (isClientType) {
            logger.info('[RouterService] Attempting to remove from MikroTik router...');
            const router = await this.findByIdWithPassword(routerId);
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
                        logger.info({ host: deleted.host }, '[RouterService] Removed from MikroTik netwatch');
                    } catch (netwatchErr: any) {
                        // Ignore if entry not found, otherwise throw
                        const msg = netwatchErr.message || '';
                        if (!msg.includes('no such item') && !msg.includes('not found')) {
                            console.error(`[RouterService] Failed to remove from MikroTik:`, msg);
                        } else {
                            logger.debug('Netwatch entry not found on router, skipping');
                        }
                    }
                } catch (err) {
                    console.error('Failed to connect/delete netwatch from router (DB entry was already deleted):', err);
                    // We don't re-throw here because the DB entry is already gone, 
                    // so the "primary" goal of the user (clearing the map) is achieved.
                } finally {
                    if (conn) await conn.close().catch(console.error);
                }
            } else {
                console.warn(`[RouterService] Router ${routerId} not found, skipped MikroTik cleanup`);
            }
        } else {
            logger.debug({ deviceType: deleted.deviceType }, '[RouterService] Device type skipped for MikroTik cleanup');
        }

        return true;
    }


    /**
     * Measure latency for all netwatch hosts on a router
     */
    async measureNetwatchLatency(routerId: string, customConn?: RouterConnection | any): Promise<void> {
        // Redirection to specialized service
        if (customConn) {
            const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
            const entries = await routerNetwatchService.getNetwatch(routerId);
            const targets = entries.filter(e => e.status !== 'unknown');
            return routerNetwatchService.measureLatency(routerId, router?.name || 'Unknown', customConn, targets);
        }

        const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
        if (!router) return;

        const password = decrypt(router.passwordEncrypted);
        let conn;
        try {
            conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password,
            });
            const entries = await routerNetwatchService.getNetwatch(routerId);
            const targets = entries.filter(e => e.status !== 'unknown');
            await routerNetwatchService.measureLatency(routerId, router.name, conn, targets);
        } catch (err) {
            console.error(`[Router ${router.name}] Failed to measure netwatch latency:`, err);
        } finally {
            if (conn) await conn.close().catch(() => { });
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
    private async syncNetwatchToOnus(routerId: string): Promise<void> {
        return routerNetwatchService.syncToOnus(routerId);
    }
}

// Export singleton instance
export const routerService = new RouterService();
