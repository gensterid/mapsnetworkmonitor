import { routerService } from './router.service.js';
import { alertService } from './alert.service.js';
import { logger } from '../lib/logger.js';

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
