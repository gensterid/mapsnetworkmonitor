import { sql, eq, gte, lte, and, count, inArray, or, ilike, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { alerts, routers, routerNetwatch, auditLogs } from '../../db/schema/index.js';
import {
    type DateRange,
    type OverviewStats,
    type AlertTrend,
    getDefaultDateRange,
    getAllowedRouterIds,
    normalizeDateRange
} from './analytics-utils.js';
import { cacheService } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';

export class EventAnalyticsService {
    /**
     * Get overview statistics
     */
    async getOverviewStats(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<OverviewStats> {
        const range = dateRange || getDefaultDateRange();
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:overview:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${normalized.start}-${normalized.end}`;
        const cached = await cacheService.get<OverviewStats>(cacheKey);
        if (cached) return cached;

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') {
                return {
                    totalAlerts: 0,
                    unresolvedAlerts: 0,
                    criticalAlerts: 0,
                    averageUptime: 0,
                    totalRouters: 0,
                    onlineRouters: 0,
                    offlineRouters: 0,
                    totalDevices: 0,
                    pppoeConnects: 0,
                    pppoeDisconnects: 0,
                };
            }
        }

        // Build alert conditions
        const alertConditions: any[] = [
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) alertConditions.push(eq(alerts.tenantId, tenantId));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            alertConditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            alertConditions.push(inArray(alerts.routerId, allowedIds));
        }

        const alertStats = await db
            .select({
                total: count(),
                unresolved: sql<number>`SUM(CASE WHEN ${alerts.resolved} = false THEN 1 ELSE 0 END)`,
                critical: sql<number>`SUM(CASE WHEN ${alerts.severity} = 'critical' THEN 1 ELSE 0 END)`,
                pppoeConnects: sql<number>`SUM(CASE WHEN ${alerts.type} = 'pppoe_connect' THEN 1 ELSE 0 END)`,
                pppoeDisconnects: sql<number>`SUM(CASE WHEN ${alerts.type} = 'pppoe_disconnect' THEN 1 ELSE 0 END)`,
            })
            .from(alerts)
            .where(and(...alertConditions));

        let totalRouters = 0, onlineRouters = 0, offlineRouters = 0, totalDevices = 0;

        if (routerId) {
            const [router] = await db.select().from(routers).where(and(eq(routers.id, routerId), tenantId ? eq(routers.tenantId, tenantId) : undefined));
            if (router) {
                totalRouters = 1;
                onlineRouters = router.status === 'online' ? 1 : 0;
                offlineRouters = router.status !== 'online' ? 1 : 0;
            }
            const [deviceCount] = await db
                .select({ count: count() })
                .from(routerNetwatch)
                .where(and(eq(routerNetwatch.routerId, routerId), tenantId ? eq(routerNetwatch.tenantId, tenantId) : undefined));
            totalDevices = Number(deviceCount?.count) || 0;
        } else {
            let routerQuery = db.select({
                total: count(),
                online: sql<number>`SUM(CASE WHEN ${routers.status} = 'online' THEN 1 ELSE 0 END)`,
                offline: sql<number>`SUM(CASE WHEN ${routers.status} != 'online' THEN 1 ELSE 0 END)`,
            }).from(routers);

            const routerConditions = [];
            if (tenantId) routerConditions.push(eq(routers.tenantId, tenantId));
            if (userRole !== 'admin' && userRole !== 'superadmin') routerConditions.push(inArray(routers.id, allowedIds));

            const routerStats = await routerQuery.where(and(...routerConditions));
            totalRouters = Number(routerStats[0]?.total) || 0;
            onlineRouters = Number(routerStats[0]?.online) || 0;
            offlineRouters = Number(routerStats[0]?.offline) || 0;

            let deviceQuery = db.select({ count: count() }).from(routerNetwatch);
            const deviceConditions = [];
            if (tenantId) deviceConditions.push(eq(routerNetwatch.tenantId, tenantId));
            if (userRole !== 'admin' && userRole !== 'superadmin') deviceConditions.push(inArray(routerNetwatch.routerId, allowedIds));

            const [deviceCount] = await deviceQuery.where(and(...deviceConditions));
            totalDevices = Number(deviceCount?.count) || 0;
        }

        const averageUptime = totalRouters > 0 ? Math.round((onlineRouters / totalRouters) * 100 * 10) / 10 : 100;

        const stats = {
            totalAlerts: Number(alertStats[0]?.total) || 0,
            unresolvedAlerts: Number(alertStats[0]?.unresolved) || 0,
            criticalAlerts: Number(alertStats[0]?.critical) || 0,
            averageUptime,
            totalRouters,
            onlineRouters,
            offlineRouters,
            totalDevices,
            pppoeConnects: Number(alertStats[0]?.pppoeConnects) || 0,
            pppoeDisconnects: Number(alertStats[0]?.pppoeDisconnects) || 0,
        };

        // Cache for 2 minutes (overview is highly visible)
        await cacheService.set(cacheKey, stats, 120);

        return stats;
    }

    /**
     * Get alert trends by day
     */
    async getAlertTrends(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string,
        search?: string
    ): Promise<AlertTrend[]> {
        const range = dateRange || getDefaultDateRange();
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:alert_trends:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${search || 'none'}:${normalized.start}-${normalized.end}`;
        const cached = await cacheService.get<AlertTrend[]>(cacheKey);
        if (cached) return cached;

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        const conditions: any[] = [
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) conditions.push(eq(alerts.tenantId, tenantId));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            conditions.push(inArray(alerts.routerId, allowedIds));
        }

        if (search) {
            const searchTerm = `%${search}%`;
            conditions.push(or(
                ilike(alerts.title, searchTerm),
                ilike(alerts.message, searchTerm)
            ));
        }

        const trends = await db
            .select({
                date: sql<string>`DATE(${alerts.createdAt})`.as('date'),
                total: count(),
                critical: sql<number>`SUM(CASE WHEN ${alerts.severity} = 'critical' THEN 1 ELSE 0 END)`,
                warning: sql<number>`SUM(CASE WHEN ${alerts.severity} = 'warning' THEN 1 ELSE 0 END)`,
                info: sql<number>`SUM(CASE WHEN ${alerts.severity} = 'info' THEN 1 ELSE 0 END)`,
                pppoeConnect: sql<number>`SUM(CASE WHEN ${alerts.type} = 'pppoe_connect' THEN 1 ELSE 0 END)`,
                pppoeDisconnect: sql<number>`SUM(CASE WHEN ${alerts.type} = 'pppoe_disconnect' THEN 1 ELSE 0 END)`,
            })
            .from(alerts)
            .where(and(...conditions))
            .groupBy(sql`DATE(${alerts.createdAt})`)
            .orderBy(sql`DATE(${alerts.createdAt})`);

        const results = trends.map(t => ({
            date: String(t.date),
            total: Number(t.total) || 0,
            critical: Number(t.critical) || 0,
            warning: Number(t.warning) || 0,
            info: Number(t.info) || 0,
            pppoeConnect: Number(t.pppoeConnect) || 0,
            pppoeDisconnect: Number(t.pppoeDisconnect) || 0,
        }));

        // Cache for 5 minutes
        await cacheService.set(cacheKey, results, 300);

        return results;
    }

    /**
     * Get audit logs with pagination
     */
    async getAuditLogs(
        page: number,
        limit: number,
        dateRange?: DateRange,
        action?: string,
        entity?: string,
        tenantId?: string
    ): Promise<{ logs: any[]; total: number; page: number; totalPages: number }> {
        const offset = (page - 1) * limit;
        const range = dateRange || getDefaultDateRange();

        const conditions = [
            gte(auditLogs.createdAt, range.startDate),
            lte(auditLogs.createdAt, range.endDate),
        ];

        if (tenantId) conditions.push(eq(auditLogs.tenantId, tenantId));
        if (action) conditions.push(eq(auditLogs.action, action));
        if (entity) conditions.push(eq(auditLogs.entity, entity));

        const logs = await db
            .select()
            .from(auditLogs)
            .where(and(...conditions))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit)
            .offset(offset);

        const [countResult] = await db.select({ count: count() }).from(auditLogs).where(and(...conditions));
        const total = Number(countResult?.count) || 0;

        return {
            logs: logs.map(l => ({
                id: l.id,
                userId: l.userId,
                action: l.action,
                entity: l.entity,
                entityId: l.entityId,
                details: l.details,
                ipAddress: l.ipAddress,
                createdAt: l.createdAt,
            })),
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Get detailed alerts list (for drill-down)
     */
    async getAlertsList(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string,
        limit: number = 50,
        resolved?: boolean
    ): Promise<any[]> {
        const range = dateRange || getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        const conditions: any[] = [
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) conditions.push(eq(alerts.tenantId, tenantId));
        if (resolved !== undefined) conditions.push(eq(alerts.resolved, resolved));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            conditions.push(inArray(alerts.routerId, allowedIds));
        }

        return await db
            .select({
                id: alerts.id,
                title: alerts.title,
                message: alerts.message,
                severity: alerts.severity,
                createdAt: alerts.createdAt,
                resolved: alerts.resolved,
                acknowledged: alerts.acknowledged,
                routerName: routers.name,
            })
            .from(alerts)
            .leftJoin(routers, eq(alerts.routerId, routers.id))
            .where(and(...conditions))
            .orderBy(desc(alerts.createdAt))
            .limit(limit);
    }

    /**
     * Get issues analysis (frequent issues)
     */
    async getIssuesAnalysis(
        dateRange?: DateRange,
        limit: number = 10,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{ title: string; count: number; lastOccurred: Date; routerName: string; severity: string }[]> {
        const range = dateRange || getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        const conditions: any[] = [
            inArray(alerts.severity, ['warning', 'critical']),
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) conditions.push(eq(alerts.tenantId, tenantId));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            conditions.push(inArray(alerts.routerId, allowedIds));
        }

        const results = await db
            .select({
                title: alerts.title,
                count: count(),
                lastOccurred: sql<Date>`MAX(${alerts.createdAt})`,
                severity: sql<string>`MAX(${alerts.severity})`,
                routerId: alerts.routerId,
            })
            .from(alerts)
            .where(and(...conditions))
            .groupBy(alerts.title, alerts.routerId)
            .orderBy(desc(count()))
            .limit(limit);

        return await Promise.all(
            results.map(async (r) => {
                const [router] = await db.select({ name: routers.name }).from(routers).where(eq(routers.id, r.routerId)).limit(1);
                return {
                    title: r.title,
                    count: Number(r.count) || 0,
                    lastOccurred: r.lastOccurred,
                    routerName: router?.name || 'Unknown',
                    severity: r.severity,
                };
            })
        );
    }

    /**
     * Get resolution statistics - average time to resolve alerts
     */
    async getResolutionStats(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{
        avgResolutionMinutes: number;
        totalResolved: number;
        bySeverity: { critical: number; warning: number; info: number; };
        fastestResolution: number;
        slowestResolution: number;
    }> {
        const range = dateRange || getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') {
                return { avgResolutionMinutes: 0, totalResolved: 0, bySeverity: { critical: 0, warning: 0, info: 0 }, fastestResolution: 0, slowestResolution: 0 };
            }
        }

        const conditions: any[] = [
            eq(alerts.resolved, true),
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) conditions.push(eq(alerts.tenantId, tenantId));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            conditions.push(inArray(alerts.routerId, allowedIds));
        }

        const resolvedAlerts = await db
            .select({
                severity: alerts.severity,
                createdAt: alerts.createdAt,
                resolvedAt: alerts.resolvedAt,
            })
            .from(alerts)
            .where(and(...conditions));

        if (resolvedAlerts.length === 0) {
            return { avgResolutionMinutes: 0, totalResolved: 0, bySeverity: { critical: 0, warning: 0, info: 0 }, fastestResolution: 0, slowestResolution: 0 };
        }

        let totalTimeMinutes = 0, criticalTime = 0, criticalCount = 0, warningTime = 0, warningCount = 0, infoTime = 0, infoCount = 0, fastest = Infinity, slowest = 0;

        for (const alert of resolvedAlerts) {
            const start = alert.createdAt;
            const end = alert.resolvedAt || new Date();
            const durationMinutes = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));

            totalTimeMinutes += durationMinutes;
            if (durationMinutes < fastest) fastest = durationMinutes;
            if (durationMinutes > slowest) slowest = durationMinutes;

            if (alert.severity === 'critical') { criticalTime += durationMinutes; criticalCount++; }
            else if (alert.severity === 'warning') { warningTime += durationMinutes; warningCount++; }
            else { infoTime += durationMinutes; infoCount++; }
        }

        return {
            avgResolutionMinutes: Math.round(totalTimeMinutes / resolvedAlerts.length),
            totalResolved: resolvedAlerts.length,
            bySeverity: {
                critical: criticalCount > 0 ? Math.round(criticalTime / criticalCount) : 0,
                warning: warningCount > 0 ? Math.round(warningTime / warningCount) : 0,
                info: infoCount > 0 ? Math.round(infoTime / infoCount) : 0,
            },
            fastestResolution: Math.round(fastest === Infinity ? 0 : fastest * 10) / 10,
            slowestResolution: Math.round(slowest)
        };
    }
}

export const eventAnalyticsService = new EventAnalyticsService();
