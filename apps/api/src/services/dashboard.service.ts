import { routerService } from './router.service.js';
import { alertService } from './alert.service.js';
import { logger } from '../lib/logger.js';
import { db } from '../db/index.js';
import { routerNetwatch, pppoeSessions, routers } from '../db/schema/index.js';
import { eq, sql, count, and, inArray, desc } from 'drizzle-orm';
import { userRouters } from '../db/schema/user-routers.js';

interface DashboardStats {
    routers: {
        total: number;
        online: number;
        offline: number;
        maintenance: number;
    };
    alerts: {
        total: number;
        critical: number;
        warning: number;
        info: number;
    };
    netwatch: {
        total: number;
        up: number;
        down: number;
    };
    pppoe: {
        total: number;
        up: number;
        down: number;
    };
}

interface MapMarker {
    id: string;
    name: string;
    host: string;
    status: string;
    latitude: number | null;
    longitude: number | null;
    location: string | null;
    groupId: string | null;
    lastSeen: Date | null;
}

// ─── Simple In-Memory Cache ──────────────────────────────────────
interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class MemoryCache {
    private store = new Map<string, CacheEntry<unknown>>();

    get<T>(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlMs: number): void {
        this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
    }

    invalidate(key?: string): void {
        if (key) {
            this.store.delete(key);
        } else {
            this.store.clear();
        }
    }
}
// ──────────────────────────────────────────────────────────────────

const CACHE_TTL = 30_000; // 30 seconds

/**
 * Dashboard Service - aggregates data for dashboard display
 * Uses in-memory cache to reduce database load
 */
export class DashboardService {
    private cache = new MemoryCache();

    /**
     * Get dashboard statistics (cached 30s)
     */
    async getStats(tenantId?: string, userId?: string, userRole?: string): Promise<DashboardStats> {
        const cacheKey = `stats_${tenantId || 'global'}_${userId || 'all'}`;
        const cached = this.cache.get<DashboardStats>(cacheKey);
        if (cached) return cached;

        const routerStats = await routerService.countByStatus(tenantId);
        const alertStats = await alertService.countBySeverity(userId, userRole, tenantId);

        // Fetch Netwatch statistics
        const netwatchFilters = [];
        if (tenantId) netwatchFilters.push(eq(routerNetwatch.tenantId, tenantId));
        
        // If user is restricted, only count for their assigned routers
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));
            const assignedIds = assigned.map(a => a.routerId);
            if (assignedIds.length > 0) {
                netwatchFilters.push(inArray(routerNetwatch.routerId, assignedIds));
            } else {
                // No routers assigned
                netwatchFilters.push(eq(sql`1`, 0));
            }
        }

        const [netwatchStatsRaw] = await db
            .select({
                total: count(),
                up: sql<number>`count(*) filter (where status = 'up')`,
                down: sql<number>`count(*) filter (where status = 'down')`,
            })
            .from(routerNetwatch)
            .where(and(...netwatchFilters));

        // Fetch PPPoE statistics
        const pppoeFilters = [];
        if (tenantId) pppoeFilters.push(eq(pppoeSessions.tenantId, tenantId));
        
        if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));
            const assignedIds = assigned.map(a => a.routerId);
            if (assignedIds.length > 0) {
                pppoeFilters.push(inArray(pppoeSessions.routerId, assignedIds));
            } else {
                pppoeFilters.push(eq(sql`1`, 0));
            }
        }

        const [pppoeStatsRaw] = await db
            .select({
                total: count(),
                up: sql<number>`count(*) filter (where status = 'active')`,
                down: sql<number>`count(*) filter (where status = 'disconnected')`,
            })
            .from(pppoeSessions)
            .where(and(...pppoeFilters));

        const stats: DashboardStats = {
            routers: {
                total: routerStats.total,
                online: routerStats.online,
                offline: routerStats.offline,
                maintenance: routerStats.maintenance,
            },
            alerts: {
                total: alertStats.info + alertStats.warning + alertStats.critical,
                critical: alertStats.critical,
                warning: alertStats.warning,
                info: alertStats.info,
            },
            netwatch: {
                total: Number(netwatchStatsRaw?.total || 0),
                up: Number(netwatchStatsRaw?.up || 0),
                down: Number(netwatchStatsRaw?.down || 0),
            },
            pppoe: {
                total: Number(pppoeStatsRaw?.total || 0),
                up: Number(pppoeStatsRaw?.up || 0),
                down: Number(pppoeStatsRaw?.down || 0),
            },
        };

        this.cache.set(cacheKey, stats, CACHE_TTL);
        return stats;
    }

    /**
     * Get map markers for all routers (cached 30s)
     */
    async getMapMarkers(tenantId?: string, userId?: string, userRole?: string): Promise<MapMarker[]> {
        const cacheKey = `mapMarkers_${tenantId || 'global'}_${userId || 'all'}`;
        const cached = this.cache.get<MapMarker[]>(cacheKey);
        if (cached) return cached;

        const routers = await routerService.findAll(tenantId, userId, userRole);

        const markers = routers.map((router) => ({
            id: router.id,
            name: router.name,
            host: router.host,
            status: router.status,
            latitude: router.latitude ? parseFloat(router.latitude) : null,
            longitude: router.longitude ? parseFloat(router.longitude) : null,
            location: router.location,
            groupId: router.groupId,
            lastSeen: router.lastSeen,
        }));

        this.cache.set(cacheKey, markers, CACHE_TTL);
        return markers;
    }

    /**
     * Get list of items that are currently down/disconnected
     */
    async getDownItems(type: 'netwatch' | 'pppoe', tenantId?: string, userId?: string, userRole?: string) {
        if (type === 'netwatch') {
            const filters = [eq(routerNetwatch.status, 'down')];
            if (tenantId) filters.push(eq(routerNetwatch.tenantId, tenantId));

            if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
                const assigned = await db
                    .select({ routerId: userRouters.routerId })
                    .from(userRouters)
                    .where(eq(userRouters.userId, userId));
                const assignedIds = assigned.map(a => a.routerId);
                if (assignedIds.length > 0) {
                    filters.push(inArray(routerNetwatch.routerId, assignedIds));
                } else {
                    return [];
                }
            }

            return await db
                .select({
                    id: routerNetwatch.id,
                    name: routerNetwatch.name,
                    host: routerNetwatch.host,
                    status: routerNetwatch.status,
                    lastDown: routerNetwatch.lastDown,
                    routerName: routers.name,
                    routerId: routerNetwatch.routerId,
                })
                .from(routerNetwatch)
                .leftJoin(routers, eq(routerNetwatch.routerId, routers.id))
                .where(and(...filters))
                .orderBy(desc(routerNetwatch.lastDown));
        } else {
            const filters = [eq(pppoeSessions.status, 'disconnected')];
            if (tenantId) filters.push(eq(pppoeSessions.tenantId, tenantId));

            if (userId && userRole && userRole !== 'admin' && userRole !== 'superadmin') {
                const assigned = await db
                    .select({ routerId: userRouters.routerId })
                    .from(userRouters)
                    .where(eq(userRouters.userId, userId));
                const assignedIds = assigned.map(a => a.routerId);
                if (assignedIds.length > 0) {
                    filters.push(inArray(pppoeSessions.routerId, assignedIds));
                } else {
                    return [];
                }
            }

            return await db
                .select({
                    id: pppoeSessions.id,
                    name: pppoeSessions.name,
                    host: pppoeSessions.address,
                    status: pppoeSessions.status,
                    lastDown: pppoeSessions.lastDown,
                    routerName: routers.name,
                    routerId: pppoeSessions.routerId,
                })
                .from(pppoeSessions)
                .leftJoin(routers, eq(pppoeSessions.routerId, routers.id))
                .where(and(...filters))
                .orderBy(desc(pppoeSessions.lastDown));
        }
    }

    /**
     * Get recent alerts for dashboard
     */
    async getRecentAlerts(limit = 10, tenantId?: string, userId?: string, userRole?: string) {
        const result = await alertService.findUnacknowledged({
            limit,
            tenantId,
            userId,
            userRole
        });
        return result.data;
    }

    /**
     * Invalidate dashboard cache (called after router/alert changes)
     */
    invalidateCache(): void {
        this.cache.invalidate();
        logger.debug('Dashboard cache invalidated');
    }
}

// Export singleton instance
export const dashboardService = new DashboardService();
