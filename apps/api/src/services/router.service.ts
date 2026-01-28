import { eq, desc, and } from 'drizzle-orm';
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
} from '../db/schema/index.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import {
    connectToRouter,
    getRouterInfo,
    getRouterResources,
    getRouterInterfaces,
    getNetwatchHosts,
    getRouterClock,
    testConnection,
    rebootRouter,
    parseUptimeToSeconds,
    getHotspotActive,
    getPppActive,
    getPppSessions,
    addNetwatchEntry,
    updateNetwatchEntry,
    removeNetwatchEntry,
    measurePing,
    type RouterConnection,
    type PppSession,
} from '../lib/mikrotik-api.js';
import { measureLatency } from '../lib/network-utils.js';
import { alertService } from './alert.service.js';
import { pppoeService } from './pppoe.service.js';
import { settingsService } from './settings.service.js';

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

        try {
            const conn = await connectToRouter({
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
                try {
                    const mikrotikNetwatch = await getNetwatchHosts(conn);

                    // Get existing netwatch entries from DB
                    const existingEntries = await db
                        .select()
                        .from(routerNetwatch)
                        .where(eq(routerNetwatch.routerId, id));

                    // Create a map of existing entries by host
                    const existingMap = new Map(existingEntries.map(e => [e.host, e]));

                    // Process each MikroTik netwatch entry
                    for (const nw of mikrotikNetwatch) {
                        const existing = existingMap.get(nw.host);

                        // Map disabled status or actual status
                        let status: 'up' | 'down' | 'unknown' = 'unknown';
                        if (nw.status === 'up') status = 'up';
                        else if (nw.status === 'down') status = 'down';

                        // Prefix name with [DISABLED] if needed
                        const prefix = nw.disabled ? '[DISABLED] ' : '';
                        let baseName = nw.comment || nw.name;
                        if (!baseName && existing) {
                            baseName = existing.name?.replace(/^\[DISABLED\]\s*/, '') || '';
                        }
                        const finalName = prefix + (baseName || '');

                        if (existing) {
                            // Check for status change and create alert
                            if (existing.status !== status && existing.status !== 'unknown' && status !== 'unknown') {
                                if (status === 'down' || status === 'up') {
                                    try {
                                        await alertService.createNetwatchAlert(
                                            id,
                                            `[${router.name}] ${finalName}`,
                                            nw.host,
                                            status
                                        );
                                    } catch (err) {
                                        console.error('Failed to create netwatch alert:', err);
                                    }
                                }
                            }

                            // Update existing entry
                            await db
                                .update(routerNetwatch)
                                .set({
                                    name: finalName,
                                    interval: nw.interval || existing.interval,
                                    status: status,
                                    lastCheck: new Date(),
                                    lastUp: nw.sinceUp || existing.lastUp,
                                    lastDown: nw.sinceDown || existing.lastDown,
                                    updatedAt: new Date(),
                                })
                                .where(eq(routerNetwatch.id, existing.id));
                        } else {
                            // Create new entry
                            await db
                                .insert(routerNetwatch)
                                .values({
                                    routerId: id,
                                    host: nw.host,
                                    name: finalName,
                                    interval: nw.interval || 30,
                                    status: status,
                                    lastCheck: new Date(),
                                    lastUp: nw.sinceUp,
                                    lastDown: nw.sinceDown,
                                });
                        }
                    }
                } catch (nwErr) {
                    console.error(`[Router ${router.name}] Failed to sync netwatch:`, nwErr instanceof Error ? nwErr.message : nwErr);
                }

                // Measure latency for Netwatch hosts (Concurrent limited)
                if (includeNetwatch) {
                    try {
                        // Get all netwatch entries that are known (synced)
                        const entries = await db
                            .select()
                            .from(routerNetwatch)
                            .where(eq(routerNetwatch.routerId, id));

                        // Filter those that should be pinged (e.g. not disabled, status not down?) 
                        // To be safe, we ping everything that is monitored to check latency, even if 'up'.
                        // If 'down', ping might fail (return -1) which is fine.
                        const targets = entries.filter(e => e.status !== 'unknown');

                        // Concurrency limit
                        const CONCURRENCY_LIMIT = 10;
                        const chunks = [];
                        for (let i = 0; i < targets.length; i += CONCURRENCY_LIMIT) {
                            chunks.push(targets.slice(i, i + CONCURRENCY_LIMIT));
                        }

                        for (const chunk of chunks) {
                            await Promise.all(chunk.map(async (target) => {
                                try {
                                    const { latency, packetLoss } = await measurePing(conn, target.host, 1, '50ms', '500ms');
                                    if (latency >= 0) {
                                        await db
                                            .update(routerNetwatch)
                                            .set({
                                                latency: latency,
                                                lastKnownLatency: latency, // Update last known latency
                                                packetLoss: packetLoss
                                            })
                                            .where(eq(routerNetwatch.id, target.id));

                                        // Check for performance alerts (Latency > 100ms or Packet Loss > 0%)
                                        if (latency > 100 || packetLoss > 0) {
                                            const issueType = latency > 100 ? 'high_latency' : 'packet_loss';
                                            const message = latency > 100
                                                ? `High latency detected: ${latency}ms`
                                                : `Packet loss detected: ${packetLoss}%`;

                                            // Check deduplication in alert service (we'll add a generic method or use custom)
                                            // For now, let's use a generic 'threshold' type or specific ones if we add them to enum
                                            // Schema enum for alert type: 'status_change', 'high_cpu', 'high_memory', 'high_disk', 'interface_down', 'netwatch_down', 'threshold', 'reboot', 'pppoe_connect', 'pppoe_disconnect'
                                            // We will use 'threshold' for now, or add new types. Let's stick to 'threshold' to avoid schema change for enum if possible, 
                                            // OR better: we can reuse 'netwatch_down' context but that's confusing. 
                                            // Let's assume 'threshold' is fine or check alert service capabilities.

                                            try {
                                                // Create a custom alert via alertService (we might need to expose a generic create method or add specific one)
                                                // Using a direct create call via alertService singleton since we are in routerService
                                                await alertService.createPerformanceAlert(
                                                    id,
                                                    router.name,
                                                    target.host,
                                                    target.name || target.host,
                                                    latency,
                                                    packetLoss
                                                );
                                            } catch (err) {
                                                console.error('Failed to create performance alert:', err);
                                            }
                                        }

                                    } else {
                                        // If failing to ping (latency -1), usually means 100% loss
                                        // Do NOT nullify lastKnownLatency
                                        await db
                                            .update(routerNetwatch)
                                            .set({
                                                latency: null,
                                                packetLoss: packetLoss >= 0 ? packetLoss : null
                                            })
                                            .where(eq(routerNetwatch.id, target.id));
                                    }
                                } catch (e) {
                                    // Ignore ping error
                                }
                            }));
                        }
                    } catch (pingErr) {
                        console.error(`[Router ${router.name}] Failed to measure netwatch latency:`, pingErr);
                    }
                }
            }

            // Track PPPoE sessions and create connect/disconnect alerts (before closing connection)
            if (includeNetwatch) {
                try {
                    console.log(`[Router ${router.name}] Fetching PPPoE sessions...`);
                    const currentPppSessions = await getPppSessions(conn);
                    console.log(`[Router ${router.name}] Found ${currentPppSessions.length} active PPPoE sessions`);

                    if (currentPppSessions.length > 0) {
                        console.log(`[Router ${router.name}] PPPoE usernames: ${currentPppSessions.map(s => s.name).join(', ')}`);
                    }

                    const result = await pppoeService.trackSessions(id, router.name, currentPppSessions);

                    if (result.connected.length > 0 || result.disconnected.length > 0) {
                        console.log(`[Router ${router.name}] PPPoE changes: +${result.connected.length} connected, -${result.disconnected.length} disconnected`);
                    }
                } catch (pppoeError) {
                    console.error(`[Router ${router.name}] Failed to track PPPoE sessions:`, pppoeError instanceof Error ? pppoeError.message : pppoeError);
                }
            }

            conn.close();

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
                await db.insert(routerMetrics).values({
                    routerId: id,
                    cpuLoad: resources.cpuLoad,
                    cpuCount: resources.cpuCount,
                    cpuFrequency: resources.cpuFrequency,
                    totalMemory: resources.totalMemory,
                    usedMemory: resources.usedMemory,
                    freeMemory: resources.freeMemory,
                    totalDisk: resources.totalDisk,
                    usedDisk: resources.usedDisk,
                    freeDisk: resources.freeDisk,
                    uptime: resources.uptime
                        ? parseUptimeToSeconds(resources.uptime)
                        : undefined,
                    boardTemp: resources.boardTemp,
                    voltage: resources.voltage,
                });

                // Check for metric-based alerts (CPU/Memory thresholds)
                try {
                    await alertService.checkAndCreateMetricAlerts(
                        id,
                        router.name,
                        resources.cpuLoad,
                        resources.totalMemory,
                        resources.usedMemory
                    );
                } catch (alertError) {
                    console.error('Failed to check metric alerts:', alertError);
                }
            }



            // Update interfaces
            for (const iface of interfaces) {
                // Check if interface exists
                const [existingInterface] = await db
                    .select()
                    .from(routerInterfaces)
                    .where(and(
                        eq(routerInterfaces.routerId, id),
                        eq(routerInterfaces.name, iface.name)
                    ));

                if (existingInterface) {
                    // Calculate rates (bits per second)
                    const now = new Date();
                    const lastUpdate = existingInterface.lastUpdated || new Date();
                    const seconds = (now.getTime() - lastUpdate.getTime()) / 1000;

                    let txRate = 0;
                    let rxRate = 0;

                    if (seconds > 0 && iface.txBytes !== undefined && iface.rxBytes !== undefined) {
                        const txDiff = iface.txBytes - (existingInterface.txBytes || 0);
                        const rxDiff = iface.rxBytes - (existingInterface.rxBytes || 0);

                        // Handle counter wrap or reset: if diff is negative, assume rate is 0 or ignore
                        if (txDiff >= 0) {
                            txRate = Math.round((txDiff * 8) / seconds);
                        }
                        if (rxDiff >= 0) {
                            rxRate = Math.round((rxDiff * 8) / seconds);
                        }
                    }

                    // Update existing interface
                    await db
                        .update(routerInterfaces)
                        .set({
                            ...iface,
                            status: iface.running ? 'up' : 'down',
                            lastUpdated: new Date(),
                            // calculated rates
                            txRate: txRate,
                            rxRate: rxRate,
                        })
                        .where(eq(routerInterfaces.id, existingInterface.id));
                } else {
                    // Create new interface
                    await db.insert(routerInterfaces).values({
                        routerId: id,
                        ...iface,
                        status: iface.running ? 'up' : 'down',
                        txRate: 0,
                        rxRate: 0,
                    });
                }
            }

            return updatedRouter;
            // ... (rest of function until catch block)

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
        return db
            .select()
            .from(routerInterfaces)
            .where(eq(routerInterfaces.routerId, routerId))
            .orderBy(routerInterfaces.name);
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
        return db
            .select()
            .from(routerMetrics)
            .where(eq(routerMetrics.routerId, routerId))
            .orderBy(desc(routerMetrics.recordedAt))
            .limit(limit);
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
            console.log(`[Router ${router.name}] No ping targets found in settings, returning empty array`);
            return [];
        }

        try {
            console.log(`[Router ${router.name}] Connecting to measure ping targets: ${targets.map(t => t.ip).join(', ')}`);
            const conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: router.password,
            });

            const results: { ip: string; label: string; latency: number | null; packetLoss: number | null }[] = [];

            // Ping each target (sequentially to avoid overwhelming router)
            for (const target of targets.slice(0, 6)) { // Max 6 targets
                try {
                    console.log(`[Router ${router.name}] Pinging ${target.ip}...`);
                    const { latency, packetLoss } = await measurePing(conn, target.ip);
                    console.log(`[Router ${router.name}] Ping result for ${target.ip}: ${latency}ms, Loss: ${packetLoss}%`);
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

            conn.close();
            return results;
        } catch (error) {
            console.error(`[Router ${router.name}] Failed to measure ping targets completely:`, error instanceof Error ? error.message : error);
            // Re-throw so frontend sees the error
            throw error;
        }
    }

    // ==================== NETWATCH METHODS ====================

    /**
     * Get all netwatch entries for a router
     */
    async getNetwatch(routerId: string): Promise<RouterNetwatch[]> {
        const entries = await db
            .select()
            .from(routerNetwatch)
            .where(eq(routerNetwatch.routerId, routerId))
            .orderBy(routerNetwatch.host);

        // Fetch recent 'netwatch_down' alerts to fix invalid MikroTik timestamps
        // We generally trust the server's alert timestamp over the router's "sinceDown" which might have wrong clock

        // Note: We use existing imported 'alerts' from top of file
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
            .limit(500); // Fetch enough history to cover active down statuses

        return entries.map((entry) => {
            if (entry.status === 'down' && entry.host) {
                // Try to find the latest alert for this host
                // Alert message typically contains the host IP/Identifier
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
            connectedToId?: string;
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
            status?: 'up' | 'down' | 'unknown';
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
        if (data.status !== undefined) updateData.status = data.status;

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
        console.log(`[RouterService] Deleting netwatch entry: ${netwatchId} (router: ${routerId})`);

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

        console.log(`[RouterService] Deleted netwatch from DB: ${deleted.host} (${deleted.deviceType})`);

        // 2. Apply to Router (only for client types)
        // OLT/ODP are not stored in MikroTik Netwatch
        const isClientType = deleted.deviceType === 'client' || !deleted.deviceType;
        if (isClientType) {
            console.log(`[RouterService] Attempting to remove from MikroTik router...`);
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
                        console.log(`[RouterService] Removed from MikroTik netwatch: ${deleted.host}`);
                    } catch (netwatchErr: any) {
                        // Ignore if entry not found, otherwise throw
                        const msg = netwatchErr.message || '';
                        if (!msg.includes('no such item') && !msg.includes('not found')) {
                            console.error(`[RouterService] Failed to remove from MikroTik:`, msg);
                        } else {
                            console.log('Netwatch entry not found on router, skipping');
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
            console.log(`[RouterService] Device type is ${deleted.deviceType}, skipping MikroTik cleanup`);
        }

        return true;
    }


    /**
     * Measure latency for all netwatch hosts on a router
     */
    async measureNetwatchLatency(routerId: string, customConn?: RouterConnection | any): Promise<void> {
        // Get router details if connection not provided
        let conn: any = customConn;
        let shouldClose = false;

        if (!conn) {
            const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
            if (!router) return;

            try {
                const password = decrypt(router.passwordEncrypted);
                conn = await connectToRouter({
                    host: router.host,
                    port: router.port,
                    username: router.username,
                    password,
                });
                shouldClose = true;
            } catch (err) {
                console.error(`[Router ${router.name}] Failed to connect for latency measurement:`, err);
                return;
            }
        }

        try {
            // Get all netwatch entries that are known (synced)
            const entries = await db
                .select()
                .from(routerNetwatch)
                .where(eq(routerNetwatch.routerId, routerId));

            const targets = entries.filter(e => e.status !== 'unknown');

            // Concurrency limit
            const CONCURRENCY_LIMIT = 5;
            const chunks = [];
            for (let i = 0; i < targets.length; i += CONCURRENCY_LIMIT) {
                chunks.push(targets.slice(i, i + CONCURRENCY_LIMIT));
            }

            const [router] = await db.select().from(routers).where(eq(routers.id, routerId));

            for (const chunk of chunks) {
                await Promise.all(chunk.map(async (target) => {
                    try {
                        const { latency, packetLoss } = await measurePing(conn, target.host);
                        if (latency >= 0) {
                            await db
                                .update(routerNetwatch)
                                .set({
                                    latency: latency,
                                    lastKnownLatency: latency,
                                    packetLoss: packetLoss
                                })
                                .where(eq(routerNetwatch.id, target.id));

                            if (latency > 100 || packetLoss > 0) {
                                try {
                                    await alertService.createPerformanceAlert(
                                        routerId,
                                        router?.name || 'Unknown',
                                        target.host,
                                        target.name || target.host,
                                        latency,
                                        packetLoss
                                    );
                                } catch (err) {
                                    console.error('Failed to create performance alert:', err);
                                }
                            }
                        } else {
                            await db
                                .update(routerNetwatch)
                                .set({
                                    latency: null,
                                    packetLoss: packetLoss >= 0 ? packetLoss : null
                                })
                                .where(eq(routerNetwatch.id, target.id));
                        }
                    } catch (e) {
                        // Ignore ping error
                    }
                }));
            }
        } catch (err) {
            console.error(`Failed to measure netwatch latency for router ${routerId}:`, err);
        } finally {
            if (shouldClose && conn) {
                await conn.close().catch(console.error);
            }
        }
    }

    /**
     * Sync netwatch entries from MikroTik router to database
     * This fetches the actual netwatch configuration from the router
     */
    async syncNetwatchFromRouter(routerId: string): Promise<{ synced: number; errors: string[] }> {
        const errors: string[] = [];
        let synced = 0;

        // Get router details
        const [router] = await db
            .select()
            .from(routers)
            .where(eq(routers.id, routerId));

        if (!router) {
            throw new Error('Router not found');
        }

        // Decrypt password
        const password = decrypt(router.passwordEncrypted);
        const connection: RouterConnection = {
            host: router.host,
            port: router.port,
            username: router.username,
            password,
        };

        let api: any;

        try {
            // Connect to router
            api = await connectToRouter(connection);

            try {
                // Fetch router clock for time sync
                let routerClock;
                try {
                    routerClock = await getRouterClock(api);
                } catch (clockErr) {
                    console.warn(`[Router ${router.name}] Failed to fetch clock:`, clockErr);
                }

                // Fetch netwatch entries from MikroTik
                const mikrotikNetwatch = await getNetwatchHosts(api, routerClock);

                // Get existing netwatch entries from DB
                const existingEntries = await db
                    .select()
                    .from(routerNetwatch)
                    .where(eq(routerNetwatch.routerId, routerId));

                // Create a map of existing entries by host
                const existingMap = new Map(existingEntries.map(e => [e.host, e]));

                // Process each MikroTik netwatch entry
                for (const nw of mikrotikNetwatch) {
                    // if (nw.disabled) continue; // Don't skip disabled entries

                    const existing = existingMap.get(nw.host);
                    // Map disabled status or actual status
                    let status: 'up' | 'down' | 'unknown' = 'unknown';
                    if (nw.status === 'up') status = 'up';
                    else if (nw.status === 'down') status = 'down';

                    // If disabled, we might want to still show strict status or unknown?
                    // Let's keep strict status but maybe append (Disabled) to name if needed? 
                    // For now just syncing them is enough for the user request.

                    // Prefix name with [DISABLED] if needed
                    const prefix = nw.disabled ? '[DISABLED] ' : '';
                    let baseName = nw.comment || nw.name;
                    if (!baseName && existing) {
                        // If we don't have a name from mikrotik, use existing name (stripping old prefix if any)
                        baseName = existing.name?.replace(/^\[DISABLED\]\s*/, '') || '';
                    }
                    const finalName = prefix + (baseName || '');

                    if (existing) {
                        // Check for status change and create alert
                        if (existing.status !== status && existing.status !== 'unknown' && status !== 'unknown') {
                            console.log(`[NETWATCH] Status change detected for ${nw.host}: ${existing.status} -> ${status}`);
                            if (status === 'down' || status === 'up') {
                                try {
                                    console.log(`[NETWATCH] Creating alert for ${nw.host} (${status})`);
                                    const alert = await alertService.createNetwatchAlert(
                                        routerId,
                                        `[${router.name}] ${finalName}`,
                                        nw.host,
                                        status
                                    );
                                    if (alert) {
                                        console.log(`[NETWATCH] Alert created: ${alert.id}`);
                                    } else {
                                        console.log(`[NETWATCH] Alert was not created (deduplication or settings)`);
                                    }
                                } catch (err) {
                                    console.error('Failed to create netwatch alert:', err);
                                }
                            }
                        }

                        // Update existing entry
                        await db
                            .update(routerNetwatch)
                            .set({
                                name: finalName,
                                interval: nw.interval || existing.interval,
                                status: status,
                                lastCheck: new Date(),
                                lastUp: nw.sinceUp || existing.lastUp,
                                lastDown: nw.sinceDown || existing.lastDown,
                                updatedAt: new Date(),
                            })
                            .where(eq(routerNetwatch.id, existing.id));
                        synced++;
                    } else {
                        // Create new entry
                        await db
                            .insert(routerNetwatch)
                            .values({
                                routerId,
                                host: nw.host,
                                name: finalName,
                                interval: nw.interval || 30,
                                status: status,
                                lastCheck: new Date(),
                                lastUp: nw.sinceUp,
                                lastDown: nw.sinceDown,
                            });
                        synced++;
                    }
                }

                // --- ADDED: Measure latency immediately using the existing connection ---
                console.log(`[Router ${router.name}] Measuring latency after sync...`);
                await this.measureNetwatchLatency(routerId, api);

            } finally {
                if (api) await api.close();
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Failed to sync netwatch: ${message}`);
        }

        return { synced, errors };
    }
}

// Export singleton instance
export const routerService = new RouterService();
