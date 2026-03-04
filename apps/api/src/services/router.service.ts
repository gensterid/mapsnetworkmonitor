import { eq, desc, and, or, getTableColumns, sql, inArray } from 'drizzle-orm';
import { randomBytes } from 'crypto';
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
    olts,
    topologyNodes,
} from '../db/schema/index.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
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
    configureNetwatchWebhook,
    getNeighbors,
    getRomonNeighbors,
    isRouterosQuirk,
    type RouterConnection,
    type PppSession,
    type RouterNeighbor,
    type RomonNeighbor,
} from '../lib/mikrotik-api.js';
import { measureLatency } from '../lib/network-utils.js';
import { alertService } from './alert.service.js';
import { pppoeService } from './pppoe.service.js';
import { settingsService } from './settings.service.js';
import { snmpService } from './snmp.service.js';
import { routerNetwatchService } from './router-netwatch.service.js';
import { routerMetricsService } from './router-metrics.service.js';
import { routerInterfaceService } from './router-interface.service.js';
import { eventEmitter } from './event-emitter.service.js';
import { routerActionService } from './router-action.service.js';
import { routerSyncService } from './router-sync.service.js';
import { cacheService } from '../lib/cache.js';

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
    useWebhook?: boolean;
    pollingIntervalMetrics?: number;
    gatewayId?: string | null;
    romonMac?: string | null;
}

export interface UpdateRouterInput {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string; // Plain text password (only if updating)
    latitude?: string | null;
    longitude?: string | null;
    location?: string | null;
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
    useWebhook?: boolean;
    pollingIntervalMetrics?: number;
    status?: 'online' | 'offline' | 'maintenance' | 'unknown';
    gatewayId?: string | null;
    romonMac?: string | null;
}

/**
 * Router Service - handles router CRUD and monitoring operations
 */
export class RouterService {
    /**
     * Get all routers with their latest metrics and fastest interface speed
     */
    async findAll(
        tenantId?: string | string[],
        userId?: string,
        userRole?: string
    ): Promise<(Router & { latestMetrics?: RouterMetric; maxInterfaceSpeed?: string })[]> {
        let query = db.select().from(routers).orderBy(routers.name).$dynamic();

        const filters = [];

        // Tenant Isolation
        if (tenantId) {
            if (Array.isArray(tenantId)) {
                if (tenantId.length > 0) {
                    filters.push(inArray(routers.tenantId, tenantId));
                }
            } else {
                filters.push(eq(routers.tenantId, tenantId));
            }
        }

        // If user is not admin, filter by assigned routers
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return [];
            }

            filters.push(inArray(routers.id, routerIds));
        }

        if (filters.length > 0) {
            query = db
                .select()
                .from(routers)
                .where(and(...filters))
                .orderBy(routers.name)
                .$dynamic();
        }

        const cacheKey = `routers:list:${tenantId || 'global'}:${userId || 'none'}`;
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) return cached;

        const allRouters = await query;
        if (allRouters.length === 0) return [];

        const routerIds = allRouters.map(r => r.id);
        const { inArray: inArr } = await import('drizzle-orm');

        // Batch query 1: Latest metrics for all routers using DISTINCT ON
        // Convert JS array to PostgreSQL array literal for proper binding
        const routerIdsArrayLiteral = `{${routerIds.join(',')}}`;
        const latestMetricsRows: RouterMetric[] = await db.execute(sql`
            SELECT DISTINCT ON (router_id) *
            FROM router_metrics
            WHERE router_id = ANY(${routerIdsArrayLiteral}::uuid[])
            ORDER BY router_id, recorded_at DESC
        `);

        const metricsMap = new Map<string, RouterMetric>();
        for (const raw of latestMetricsRows as any[]) {
            metricsMap.set(raw.router_id, {
                id: raw.id,
                tenantId: raw.tenant_id,
                routerId: raw.router_id,
                cpuLoad: raw.cpu_load,
                cpuCount: raw.cpu_count,
                cpuFrequency: raw.cpu_frequency,
                totalMemory: raw.total_memory,
                freeMemory: raw.free_memory,
                usedMemory: raw.used_memory,
                totalDisk: raw.total_disk,
                freeDisk: raw.free_disk,
                usedDisk: raw.used_disk,
                uptime: raw.uptime,
                temperature: raw.temperature,
                voltage: raw.voltage,
                boardTemp: raw.board_temp,
                currentFirmware: raw.current_firmware,
                upgradeFirmware: raw.upgrade_firmware,
                recordedAt: raw.recorded_at,
            });
        }

        // Batch query 2: All running interfaces for all routers
        const allInterfaces = await db
            .select()
            .from(routerInterfaces)
            .where(
                and(
                    inArr(routerInterfaces.routerId, routerIds),
                    eq(routerInterfaces.running, true)
                )
            );

        const speedMap = new Map<string, string>();
        for (const iface of allInterfaces) {
            if (iface.speed) {
                const current = speedMap.get(iface.routerId);
                if (!current || this.parseSpeed(iface.speed) > this.parseSpeed(current)) {
                    speedMap.set(iface.routerId, iface.speed);
                }
            }
        }

        // Assemble results with O(1) lookups
        const results = allRouters.map(router => ({
            ...router,
            latestMetrics: metricsMap.get(router.id),
            maxInterfaceSpeed: speedMap.get(router.id),
        }));

        // Cache for 30 seconds
        await cacheService.set(cacheKey, results, 30);

        return results;
    }

    /**
     * Check if a user has access to a specific router
     */
    async hasAccess(userId: string, userRole: string, routerId: string, tenantId?: string): Promise<boolean> {
        if (userRole === 'superadmin') return true;

        // Check if router exists and belongs to the same tenant
        if (tenantId) {
            const router = await this.findById(routerId, tenantId);
            if (!router) return false;
        }

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
    async findById(id: string, tenantId?: string): Promise<Router | undefined> {
        const filters = [eq(routers.id, id)];
        if (tenantId) {
            filters.push(eq(routers.tenantId, tenantId));
        }

        const cacheKey = `routers:detail:${id}`;
        const cached = await cacheService.get<Router>(cacheKey);
        if (cached && (!tenantId || cached.tenantId === tenantId)) return cached;

        const [router] = await db
            .select()
            .from(routers)
            .where(and(...filters));

        if (router) {
            await cacheService.set(cacheKey, router, 60); // Cache for 1 min
        }
        return router;
    }

    /**
     * Get router by ID with decrypted password (for internal use)
     */
    async findByIdWithPassword(
        id: string,
        tenantId?: string
    ): Promise<(Router & { password: string }) | undefined> {
        const router = await this.findById(id, tenantId);
        if (!router) return undefined;

        return {
            ...router,
            password: decrypt(router.passwordEncrypted),
        };
    }

    /**
     * Create a new router
     */
    async create(data: CreateRouterInput, tenantId: string): Promise<Router> {
        const encryptedPassword = encrypt(data.password);

        const [router] = await db
            .insert(routers)
            .values({
                tenantId: tenantId,
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
                useWebhook: data.useWebhook || false,
                webhookSecret: randomBytes(16).toString('hex'),
                pollingIntervalMetrics: data.pollingIntervalMetrics || 300,
                status: 'unknown',
            })
            .returning();

        if (router) {
            // Invalidate router lists
            await cacheService.deletePattern('routers:list:*');

            eventEmitter.broadcast('map_update', {
                type: 'router',
                id: router.id,
                action: 'create',
            });
        }

        return router;
    }

    /**
     * Update router
     */
    async update(id: string, data: UpdateRouterInput, tenantId?: string): Promise<Router | undefined> {
        // Enforce tenant isolation for the update target
        if (tenantId) {
            const current = await this.findById(id, tenantId);
            if (!current) throw ApiError.notFound('Router not found or access denied');
        }

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
        if (data.useWebhook !== undefined) {
            updateData.useWebhook = data.useWebhook;
            // Generate secret if enabling webhook and it's missing
            const current = await this.findById(id, tenantId);
            if (data.useWebhook && (!current?.webhookSecret)) {
                updateData.webhookSecret = randomBytes(16).toString('hex');
            }
        }
        if (data.pollingIntervalMetrics !== undefined) updateData.pollingIntervalMetrics = data.pollingIntervalMetrics;
        if (data.status !== undefined) updateData.status = data.status;

        const [router] = await db
            .update(routers)
            .set(updateData)
            .where(eq(routers.id, id))
            .returning();

        // If webhook toggle changed, trigger a background refresh to push/pull scripts
        if (router && data.useWebhook !== undefined) {
            logger.info({ routerId: id, useWebhook: data.useWebhook }, 'Webhook toggle changed, triggering background sync');
            this.refreshRouterStatus(id, true, false, tenantId).catch(err => {
                logger.error({ err, routerId: id }, 'Background sync after webhook toggle failed');
            });
        }

        if (router) {
            // Invalidate cache
            await cacheService.delete(`routers:detail:${id}`);
            await cacheService.deletePattern('routers:list:*');

            eventEmitter.broadcast('map_update', {
                type: 'router',
                id: router.id,
                action: 'update',
            });
        }

        return router;
    }

    /**
     * Delete router
     */
    async delete(id: string, tenantId?: string): Promise<boolean> {
        const filters = [eq(routers.id, id)];
        if (tenantId) {
            filters.push(eq(routers.tenantId, tenantId));
        }

        const result = await db.delete(routers).where(and(...filters)).returning();
        if (result.length > 0) {
            // Invalidate cache
            await cacheService.delete(`routers:detail:${id}`);
            await cacheService.deletePattern('routers:list:*');

            eventEmitter.broadcast('map_update', {
                type: 'router',
                id: id,
                action: 'delete',
            });
            return true;
        }
        return false;
    }

    /**
     * Test connection to a router
     */
    async testConnection(
        id: string,
        tenantId?: string
    ): Promise<{ success: boolean; info?: unknown; error?: string }> {
        return routerActionService.testConnection(id, tenantId);
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
        return routerActionService.testConnectionWithCredentials(host, port, username, password);
    }

    /**
     * Fetch and update router status and info
     */
    async refreshRouterStatus(id: string, includeNetwatch: boolean = false, isFullSync: boolean = true, tenantId?: string): Promise<Router | undefined> {
        return routerSyncService.refreshRouterStatus(id, includeNetwatch, isFullSync, tenantId);
    }

    /**
     * Reboot a router
     */
    async reboot(id: string, tenantId?: string): Promise<{ success: boolean; error?: string }> {
        return routerActionService.reboot(id, tenantId);
    }

    /**
     * Get router interfaces
     */
    async getInterfaces(routerId: string, tenantId?: string): Promise<RouterInterface[]> {
        if (tenantId) {
            const router = await this.findById(routerId, tenantId);
            if (!router) return [];
        }
        return routerInterfaceService.getInterfaces(routerId);
    }

    async getLatestMetrics(routerId: string, tenantId?: string): Promise<RouterMetric | null> {
        if (tenantId) {
            const router = await this.findById(routerId, tenantId);
            if (!router) return null;
        }
        const [metric] = await db
            .select()
            .from(routerMetrics)
            .where(eq(routerMetrics.routerId, routerId))
            .orderBy(desc(routerMetrics.recordedAt))
            .limit(1);
        return metric || null;
    }

    async getHotspotActive(routerId: string, tenantId?: string): Promise<number> {
        return routerActionService.getHotspotActive(routerId, tenantId);
    }

    async getPppActive(routerId: string, tenantId?: string): Promise<number> {
        return routerActionService.getPppActive(routerId, tenantId);
    }

    async getPppSessions(routerId: string, tenantId?: string): Promise<PppSession[]> {
        return routerActionService.getPppSessions(routerId, tenantId);
    }

    async getMetricsHistory(
        routerId: string,
        limit = 100,
        tenantId?: string
    ): Promise<RouterMetric[]> {
        if (tenantId) {
            const router = await this.findById(routerId, tenantId);
            if (!router) return [];
        }
        return routerMetricsService.getMetricsHistory(routerId, limit);
    }

    /**
     * Get real-time traffic using SNMP (faster/lighter than API)
     */
    async getSnmpTraffic(routerId: string, tenantId?: string): Promise<Record<string, { tx: number; rx: number }>> {
        const router = await this.findById(routerId, tenantId);
        if (!router) return {};
        return routerMetricsService.getSnmpTraffic(router);
    }

    /**
     * Count routers by status
     */
    async countByStatus(tenantId?: string): Promise<{
        total: number;
        online: number;
        offline: number;
        maintenance: number;
        unknown: number;
    }> {
        const filters = [];
        if (tenantId) {
            filters.push(eq(routers.tenantId, tenantId));
        }

        const query = filters.length > 0
            ? db.select().from(routers).where(and(...filters))
            : db.select().from(routers);

        const allRouters = await query;

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
     */
    async measurePingTargets(routerId: string, tenantId?: string): Promise<{ ip: string; label: string; latency: number | null; packetLoss: number | null }[]> {
        return routerActionService.measurePingTargets(routerId, tenantId);
    }

    // ==================== NETWATCH METHODS ====================

    /**
     * Get all netwatch entries for a router
     */
    async getNetwatch(routerId: string, tenantId?: string): Promise<any[]> {
        if (tenantId) {
            const router = await this.findById(routerId, tenantId);
            if (!router) return [];
        }
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
    async createNetwatch(
        routerId: string,
        data: any,
        tenantId?: string
    ): Promise<RouterNetwatch> {
        return routerNetwatchService.create(routerId, data, tenantId);
    }

    /**
     * Update a netwatch entry
     */
    async updateNetwatch(
        routerId: string,
        netwatchId: string,
        data: any,
        tenantId?: string
    ): Promise<RouterNetwatch | undefined> {
        return routerNetwatchService.updateEntry(routerId, netwatchId, data, tenantId);
    }

    /**
     * Delete a netwatch entry
     */
    async deleteNetwatch(routerId: string, netwatchId: string, tenantId?: string, deleteFromMikrotik: boolean = true): Promise<boolean> {
        return routerNetwatchService.delete(routerId, netwatchId, tenantId, deleteFromMikrotik);
    }

    /**
     * Measure latency for all netwatch hosts on a router
     */
    async measureNetwatchLatency(routerId: string, customConn?: any): Promise<void> {
        return routerSyncService.measureNetwatchLatency(routerId, customConn);
    }

    /**
     * Sync netwatch entries from MikroTik router to database
     */
    async syncNetwatchFromRouter(routerId: string): Promise<{ synced: number; errors: string[] }> {
        return routerSyncService.syncNetwatchFromRouter(routerId);
    }

    /**
     * UNIFIED LINKAGE: Sync Netwatch bridging to ONUS table
     */
    private async syncNetwatchToOnus(routerId: string): Promise<void> {
        return routerSyncService.syncToOnus(routerId);
    }

    /**
     * Get discovered neighbors (MNDP)
     */
    async getNeighbors(routerId: string, tenantId?: string): Promise<RouterNeighbor[]> {
        return routerActionService.getNeighbors(routerId, tenantId);
    }

    /**
     * Get RoMON neighbors for a router
     */
    async getRomonNeighbors(routerId: string, tenantId?: string): Promise<RomonNeighbor[]> {
        return routerActionService.getRomonNeighbors(routerId, tenantId);
    }

    /**
     * Get a connection to a router, handling RoMON if configured
     */
    async getRouterConnection(routerId: string, tenantId?: string): Promise<any> {
        return routerActionService.getRouterConnection(routerId, tenantId);
    }

    /**
     * Measure ping latency to a specific IP address via MikroTik router.
     */
    async pingHost(routerId: string, ip: string, tenantId?: string): Promise<{ latency: number | null; packetLoss: number | null }> {
        return routerActionService.pingHost(routerId, ip, tenantId);
    }
}

// Export singleton instance
export const routerService = new RouterService();
