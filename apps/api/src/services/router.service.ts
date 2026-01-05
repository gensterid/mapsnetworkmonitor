import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routers,
    routerInterfaces,
    routerMetrics,
    routerNetwatch,
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
    testConnection,
    rebootRouter,
    parseUptimeToSeconds,
    getHotspotActive,
    getPppActive,
    addNetwatchEntry,
    updateNetwatchEntry,
    removeNetwatchEntry,
    type RouterConnection,
} from '../lib/mikrotik-api.js';
import { measureLatency } from '../lib/network-utils.js';
import { alertService } from './alert.service.js';

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
    async refreshRouterStatus(id: string, includeNetwatch: boolean = false): Promise<Router | undefined> {
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

            const info = await getRouterInfo(conn);
            const resources = await getRouterResources(conn);
            const interfaces = await getRouterInterfaces(conn);

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
                                        const { alertService } = await import('./alert.service');
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

            // Create alert if status changed from offline to online
            if (previousStatus === 'offline') {
                const { alertService } = await import('./alert.service');
                await alertService.createStatusChangeAlert(
                    id,
                    router.name,
                    previousStatus,
                    'online'
                );
            }

            // Save metrics
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
                const { alertService } = await import('./alert.service');
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
        } catch (error) {
            console.error(`[Router ${router.host}] Connection failed:`, error instanceof Error ? error.message : error);
            // Mark router as offline
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
                    const { alertService } = await import('./alert.service');
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

    // ==================== NETWATCH METHODS ====================

    /**
     * Get all netwatch entries for a router
     */
    async getNetwatch(routerId: string): Promise<RouterNetwatch[]> {
        return db
            .select()
            .from(routerNetwatch)
            .where(eq(routerNetwatch.routerId, routerId))
            .orderBy(routerNetwatch.host);
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
            host: string;
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
        if (data.deviceType === 'client' || !data.deviceType) {
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
                host: data.host,
                name: data.name,
                deviceType: data.deviceType || 'client',
                interval: data.interval || 30,
                latitude: data.latitude,
                longitude: data.longitude,
                location: data.location,
                waypoints: data.waypoints,
                connectionType: data.connectionType || 'router',
                connectedToId: data.connectedToId,
                status: 'unknown',
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
            location?: string;
            waypoints?: string; // JSON string of coordinates
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
        const isClientType = original.deviceType === 'client' || !original.deviceType;
        if (isClientType && (data.host || data.interval || data.name !== undefined)) {
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

        if (data.host !== undefined) updateData.host = data.host;
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
        // 0. Get original entry
        const [original] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, netwatchId));
        if (!original) return false;

        // 1. Apply to Router (only for client types)
        // OLT/ODP are not stored in MikroTik Netwatch
        const isClientType = original.deviceType === 'client' || !original.deviceType;
        if (isClientType) {
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
                        await removeNetwatchEntry(conn, original.host);
                    } catch (netwatchErr: any) {
                        // Ignore if entry not found, otherwise throw
                        const msg = netwatchErr.message || '';
                        if (!msg.includes('no such item') && !msg.includes('not found')) {
                            throw netwatchErr;
                        }
                        console.log('Netwatch entry not found on router, proceeding with DB deletion');
                    }
                } catch (err) {
                    console.error('Failed to delete netwatch from router:', err);
                    // If we can't connect to router, we should still allow deleting from DB?
                    // For now, let's log it and proceed, assuming user wants to clean up DB.
                    // Or maybe throw ONLY if it's a critical connection error?
                    // But if router is dead, user must be able to delete the device from DB.
                } finally {
                    if (conn) await conn.close().catch(console.error);
                }
            }
        }

        const result = await db
            .delete(routerNetwatch)
            .where(eq(routerNetwatch.id, netwatchId))
            .returning();

        return result.length > 0;
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

        try {
            // Connect to router
            const api = await connectToRouter(connection);

            try {
                // Fetch netwatch entries from MikroTik
                const mikrotikNetwatch = await getNetwatchHosts(api);

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
            } finally {
                await api.close();
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
