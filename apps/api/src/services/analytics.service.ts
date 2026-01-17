import { db } from '../db/index.js';
import { alerts, routers, routerMetrics, routerNetwatch, auditLogs, userRouters } from '../db/schema/index.js';
import { sql, eq, and, gte, lte, desc, count, avg, inArray } from 'drizzle-orm';

export interface DateRange {
    startDate: Date;
    endDate: Date;
}

export interface OverviewStats {
    totalAlerts: number;
    unresolvedAlerts: number;
    criticalAlerts: number;
    averageUptime: number;
    totalRouters: number;
    onlineRouters: number;
    offlineRouters: number;
    totalDevices: number;
}

export interface AlertTrend {
    date: string;
    total: number;
    critical: number;
    warning: number;
    info: number;
}

export interface UptimeStats {
    routerId: string;
    routerName: string;
    totalDowntime: number; // in minutes
    incidentCount: number;
    uptimePercentage: number;
}

export interface PerformanceData {
    timestamp: string;
    avgCpu: number;
    avgMemory: number;
}

export interface AuditLogEntry {
    id: string;
    userId: string | null;
    userName?: string;
    action: string;
    entity: string;
    entityId: string | null;
    details: any;
    ipAddress: string | null;
    createdAt: Date;
}

class AnalyticsService {
    /**
     * Get default date range (last 30 days)
     */
    getDefaultDateRange(): DateRange {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        return { startDate, endDate };
    }

    /**
     * Get allowed router IDs for a user
     */
    private async getAllowedRouterIds(userId: string, userRole: string): Promise<string[]> {
        if (userRole === 'admin') {
            return []; // Admin allows all, but we handle empty array as "all" in context or explicit null check
        }

        const assigned = await db
            .select({ routerId: userRouters.routerId })
            .from(userRouters)
            .where(eq(userRouters.userId, userId));

        return assigned.map(a => a.routerId);
    }

    /**
     * Get overview statistics
     */
    async getOverviewStats(dateRange?: DateRange, routerId?: string, userId?: string, userRole?: string): Promise<OverviewStats> {
        const range = dateRange || this.getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole && userRole !== 'admin') {
            allowedIds = await this.getAllowedRouterIds(userId, userRole);
            if (allowedIds.length === 0) {
                // Return zeros if no routers assigned
                return {
                    totalAlerts: 0,
                    unresolvedAlerts: 0,
                    criticalAlerts: 0,
                    averageUptime: 0,
                    totalRouters: 0,
                    onlineRouters: 0,
                    offlineRouters: 0,
                    totalDevices: 0,
                };
            }
        }

        // Build alert conditions
        const alertConditions: any[] = [
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (routerId) {
            // If specific router requested, check if allowed
            if (userRole !== 'admin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            alertConditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin') {
            // Filter by allowed routers
            alertConditions.push(inArray(alerts.routerId, allowedIds));
        }

        // Total and unresolved alerts in range
        const alertStats = await db
            .select({
                total: count(),
                unresolved: sql<number>`SUM(CASE WHEN ${alerts.resolved} = false THEN 1 ELSE 0 END)`,
                critical: sql<number>`SUM(CASE WHEN ${alerts.severity} = 'critical' THEN 1 ELSE 0 END)`,
            })
            .from(alerts)
            .where(and(...alertConditions));

        // Router counts
        let totalRouters = 0;
        let onlineRouters = 0;
        let offlineRouters = 0;
        let totalDevices = 0;

        if (routerId) {
            // Specific router logic (already validated permission above)
            const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
            if (router) {
                totalRouters = 1;
                onlineRouters = router.status === 'online' ? 1 : 0;
                offlineRouters = router.status !== 'online' ? 1 : 0;
            }
            const [deviceCount] = await db
                .select({ count: count() })
                .from(routerNetwatch)
                .where(eq(routerNetwatch.routerId, routerId));
            totalDevices = Number(deviceCount?.count) || 0;
        } else {
            // All allowed routers
            let routerQuery = db
                .select({
                    total: count(),
                    online: sql<number>`SUM(CASE WHEN ${routers.status} = 'online' THEN 1 ELSE 0 END)`,
                    offline: sql<number>`SUM(CASE WHEN ${routers.status} != 'online' THEN 1 ELSE 0 END)`,
                })
                .from(routers);

            if (userRole !== 'admin') {
                routerQuery.where(inArray(routers.id, allowedIds));
            }

            const routerStats = await routerQuery;
            totalRouters = Number(routerStats[0]?.total) || 0;
            onlineRouters = Number(routerStats[0]?.online) || 0;
            offlineRouters = Number(routerStats[0]?.offline) || 0;

            let deviceQuery = db
                .select({ count: count() })
                .from(routerNetwatch);

            if (userRole !== 'admin') {
                deviceQuery.where(inArray(routerNetwatch.routerId, allowedIds));
            }

            const [deviceCount] = await deviceQuery;
            totalDevices = Number(deviceCount?.count) || 0;
        }

        // Calculate uptime percentage
        const averageUptime = totalRouters > 0
            ? Math.round((onlineRouters / totalRouters) * 100 * 10) / 10
            : 100;

        return {
            totalAlerts: Number(alertStats[0]?.total) || 0,
            unresolvedAlerts: Number(alertStats[0]?.unresolved) || 0,
            criticalAlerts: Number(alertStats[0]?.critical) || 0,
            averageUptime,
            totalRouters,
            onlineRouters,
            offlineRouters,
            totalDevices,
        };
    }

    /**
     * Get alert trends by day
     */
    async getAlertTrends(dateRange?: DateRange, routerId?: string, userId?: string, userRole?: string): Promise<AlertTrend[]> {
        const range = dateRange || this.getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole && userRole !== 'admin') {
            allowedIds = await this.getAllowedRouterIds(userId, userRole);
            if (allowedIds.length === 0) return [];
        }

        const conditions: any[] = [
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (routerId) {
            if (userRole !== 'admin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin') {
            conditions.push(inArray(alerts.routerId, allowedIds));
        }

        const trends = await db
            .select({
                date: sql<string>`DATE(${alerts.createdAt})`.as('date'),
                total: count(),
                critical: sql<number>`SUM(CASE WHEN ${alerts.severity} = 'critical' THEN 1 ELSE 0 END)`,
                warning: sql<number>`SUM(CASE WHEN ${alerts.severity} = 'warning' THEN 1 ELSE 0 END)`,
                info: sql<number>`SUM(CASE WHEN ${alerts.severity} = 'info' THEN 1 ELSE 0 END)`,
            })
            .from(alerts)
            .where(and(...conditions))
            .groupBy(sql`DATE(${alerts.createdAt})`)
            .orderBy(sql`DATE(${alerts.createdAt})`);

        return trends.map(t => ({
            date: String(t.date),
            total: Number(t.total) || 0,
            critical: Number(t.critical) || 0,
            warning: Number(t.warning) || 0,
            info: Number(t.info) || 0,
        }));
    }

    /**
     * Get uptime statistics per router
     */
    async getUptimeStats(dateRange?: DateRange, routerId?: string, userId?: string, userRole?: string): Promise<UptimeStats[]> {
        const range = dateRange || this.getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole && userRole !== 'admin') {
            allowedIds = await this.getAllowedRouterIds(userId, userRole);
            if (allowedIds.length === 0) return [];
        }

        // Get routers
        let routerQuery = db.select().from(routers);

        if (routerId) {
            if (userRole !== 'admin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            routerQuery.where(eq(routers.id, routerId));
        } else if (userRole !== 'admin') {
            routerQuery.where(inArray(routers.id, allowedIds));
        }

        const routerList = await routerQuery;

        const stats: UptimeStats[] = [];

        for (const router of routerList) {
            // Count down incidents
            const [incidentStats] = await db
                .select({
                    count: count(),
                })
                .from(alerts)
                .where(and(
                    eq(alerts.routerId, router.id),
                    eq(alerts.type, 'status_change'),
                    gte(alerts.createdAt, range.startDate),
                    lte(alerts.createdAt, range.endDate)
                ));

            const incidentCount = Number(incidentStats?.count) || 0;

            // Estimate downtime (rough calculation based on incidents)
            // Assume average incident lasts 30 minutes
            const estimatedDowntime = incidentCount * 30;

            // Calculate uptime percentage
            const totalMinutes = (range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60);
            const uptimePercentage = totalMinutes > 0
                ? Math.round(((totalMinutes - estimatedDowntime) / totalMinutes) * 100 * 10) / 10
                : 100;

            stats.push({
                routerId: router.id,
                routerName: router.name,
                totalDowntime: estimatedDowntime,
                incidentCount,
                uptimePercentage: Math.max(0, Math.min(100, uptimePercentage)),
            });
        }

        // Sort by incident count descending
        return stats.sort((a, b) => b.incidentCount - a.incidentCount);
    }

    /**
     * Get performance trends (CPU/Memory average by hour)
     */
    async getPerformanceTrends(dateRange?: DateRange, routerId?: string, userId?: string, userRole?: string): Promise<PerformanceData[]> {
        const range = dateRange || this.getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole && userRole !== 'admin') {
            allowedIds = await this.getAllowedRouterIds(userId, userRole);
            if (allowedIds.length === 0) return [];
        }

        const conditions: any[] = [
            gte(routerMetrics.recordedAt, range.startDate),
            lte(routerMetrics.recordedAt, range.endDate),
        ];

        if (routerId) {
            if (userRole !== 'admin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(routerMetrics.routerId, routerId));
        } else if (userRole !== 'admin') {
            conditions.push(inArray(routerMetrics.routerId, allowedIds));
        }

        let query = db
            .select({
                timestamp: sql<string>`DATE_TRUNC('hour', ${routerMetrics.recordedAt})`.as('timestamp'),
                avgCpu: avg(routerMetrics.cpuLoad),
                avgMemory: sql<number>`AVG(CASE WHEN ${routerMetrics.totalMemory} > 0 THEN (${routerMetrics.usedMemory}::float / ${routerMetrics.totalMemory}::float * 100) ELSE 0 END)`,
            })
            .from(routerMetrics)
            .where(and(...conditions))
            .groupBy(sql`DATE_TRUNC('hour', ${routerMetrics.recordedAt})`)
            .orderBy(sql`DATE_TRUNC('hour', ${routerMetrics.recordedAt})`);

        const results = await query;

        return results.map(r => ({
            timestamp: String(r.timestamp),
            avgCpu: Math.round((Number(r.avgCpu) || 0) * 10) / 10,
            avgMemory: Math.round((Number(r.avgMemory) || 0) * 10) / 10,
        }));
    }

    /**
     * Get audit logs with pagination
     */
    async getAuditLogs(
        page: number = 1,
        limit: number = 20,
        dateRange?: DateRange,
        action?: string,
        entity?: string
    ): Promise<{ logs: AuditLogEntry[]; total: number; page: number; totalPages: number }> {
        const range = dateRange || this.getDefaultDateRange();
        const offset = (page - 1) * limit;

        // Build conditions
        const conditions = [
            gte(auditLogs.createdAt, range.startDate),
            lte(auditLogs.createdAt, range.endDate),
        ];

        if (action) {
            conditions.push(eq(auditLogs.action, action));
        }
        if (entity) {
            conditions.push(eq(auditLogs.entity, entity));
        }

        // Get total count
        const [countResult] = await db
            .select({ count: count() })
            .from(auditLogs)
            .where(and(...conditions));

        const total = Number(countResult?.count) || 0;
        const totalPages = Math.ceil(total / limit);

        // Get logs
        const logs = await db
            .select()
            .from(auditLogs)
            .where(and(...conditions))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit)
            .offset(offset);

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
            totalPages,
        };
    }

    /**
     * Get top down devices (most incidents)
     */
    async getTopDownDevices(dateRange?: DateRange, limit: number = 10, routerId?: string, userId?: string, userRole?: string): Promise<{ name: string; host: string; incidents: number }[]> {
        const range = dateRange || this.getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole && userRole !== 'admin') {
            allowedIds = await this.getAllowedRouterIds(userId, userRole);
            if (allowedIds.length === 0) return [];
        }

        const conditions: any[] = [
            eq(alerts.type, 'netwatch_down'),
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (routerId) {
            if (userRole !== 'admin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin') {
            conditions.push(inArray(alerts.routerId, allowedIds));
        }

        // Get netwatch down alerts grouped by host
        const results = await db
            .select({
                host: sql<string>`SUBSTRING(${alerts.message} FROM '(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})')`.as('host'),
                incidents: count(),
            })
            .from(alerts)
            .where(and(...conditions))
            .groupBy(sql`SUBSTRING(${alerts.message} FROM '(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})')`)
            .orderBy(desc(count()))
            .limit(limit);

        // Get device names
        const devicesWithNames = await Promise.all(
            results.map(async (r) => {
                if (!r.host) return null;
                const [device] = await db
                    .select({ name: routerNetwatch.name })
                    .from(routerNetwatch)
                    .where(eq(routerNetwatch.host, r.host))
                    .limit(1);

                return {
                    name: device?.name || r.host,
                    host: r.host,
                    incidents: Number(r.incidents) || 0,
                };
            })
        );

        return devicesWithNames.filter((d): d is NonNullable<typeof d> => d !== null);
    }
}

export const analyticsService = new AnalyticsService();
