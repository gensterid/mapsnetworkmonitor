import { sql, eq, and, gte, lte, desc, count, inArray, or, ilike } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { alerts, routers, routerNetwatch, pppoeSessions } from '../../db/schema/index.js';
import {
    type DateRange,
    type UptimeStats,
    getDefaultDateRange,
    getAllowedRouterIds,
    normalizeDateRange
} from './analytics-utils.js';
import { cacheService } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';

export class AvailabilityAnalyticsService {
    /**
     * Get uptime statistics per router
     */
    async getUptimeStats(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string,
        search?: string
    ): Promise<UptimeStats[]> {
        const range = dateRange || getDefaultDateRange();
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:uptime_stats:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${search || 'none'}:${normalized.start}-${normalized.end}`;
        const cached = await cacheService.get<UptimeStats[]>(cacheKey);
        if (cached) return cached;

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        // Get routers
        let routerQuery = db.select().from(routers);
        const routerConditions = [];
        if (tenantId) routerConditions.push(eq(routers.tenantId, tenantId));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            routerConditions.push(eq(routers.id, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            routerConditions.push(inArray(routers.id, allowedIds));
        }

        if (routerConditions.length > 0) {
            routerQuery = routerQuery.where(and(...routerConditions)) as any;
        }

        const routerList = await routerQuery;

        const stats: UptimeStats[] = [];

        for (const router of routerList) {
            const incidentConditions = [
                eq(alerts.routerId, router.id),
                gte(alerts.createdAt, range.startDate),
                lte(alerts.createdAt, range.endDate)
            ];

            if (search) {
                const searchTerm = `%${search}%`;
                incidentConditions.push(
                    eq(alerts.type, 'netwatch_down'), // For specific device, we use netwatch alerts
                    or(
                        ilike(alerts.message, searchTerm),
                        ilike(alerts.title, searchTerm)
                    ) as any
                );
            } else {
                incidentConditions.push(
                    eq(alerts.type, 'status_change'),
                    eq(alerts.message, 'Router is DOWN')
                );
            }

            const incidents = await db
                .select({
                    createdAt: alerts.createdAt,
                    resolvedAt: alerts.resolvedAt,
                    resolved: alerts.resolved,
                })
                .from(alerts)
                .where(and(...incidentConditions) as any);

            const incidentCount = incidents.length;
            let totalDowntimeMinutes = 0;

            for (const incident of incidents) {
                const start = incident.createdAt;
                // If resolved, use resolvedAt. If not resolved yet, use current time (if within range) or endDate
                let end = incident.resolved && incident.resolvedAt ? incident.resolvedAt : new Date();

                // If end is after range end, cap it
                if (end > range.endDate) end = range.endDate;

                const durationMs = new Date(end).getTime() - new Date(start).getTime();
                const durationMinutes = Math.max(0, durationMs / (1000 * 60));

                totalDowntimeMinutes += durationMinutes;
            }

            // Fallback: If no specific DOWN alerts found but we have general status_change alerts, 
            // use a smaller estimate per incident to avoid exaggeration
            if (incidentCount > 0 && totalDowntimeMinutes === 0) {
                // Try counting all status_change if precise message matching failed
                const allStatusChanges = await db
                    .select({ count: count() })
                    .from(alerts)
                    .where(and(
                        eq(alerts.routerId, router.id),
                        eq(alerts.type, 'status_change'),
                        gte(alerts.createdAt, range.startDate),
                        lte(alerts.createdAt, range.endDate)
                    ));
                const countVal = Number(allStatusChanges[0]?.count) || 0;
                // Assume 5 mins per status flip if we can't determine duration
                totalDowntimeMinutes = countVal * 5;
            }

            // Calculate uptime percentage
            const totalMinutes = (new Date(range.endDate).getTime() - new Date(range.startDate).getTime()) / (1000 * 60);
            const uptimePercentage = totalMinutes > 0
                ? Math.round(((totalMinutes - totalDowntimeMinutes) / totalMinutes) * 100 * 10) / 10
                : 100;

            stats.push({
                routerId: router.id,
                routerName: router.name,
                totalDowntime: Math.round(totalDowntimeMinutes),
                incidentCount,
                uptimePercentage: Math.max(0, Math.min(100, uptimePercentage)),
            });
        }

        // Sort by incident count descending
        const results = stats.sort((a, b) => b.incidentCount - a.incidentCount);

        // Cache for 5 minutes
        await cacheService.set(cacheKey, results, 300);

        return results;
    }

    /**
     * Get top down devices (most incidents)
     */
    async getTopDownDevices(
        dateRange?: DateRange,
        limit: number = 10,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{ name: string; host: string; incidents: number }[]> {
        const range = dateRange || getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        const conditions: any[] = [
            eq(alerts.type, 'netwatch_down'),
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) {
            conditions.push(eq(alerts.tenantId, tenantId));
        }

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
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

    /**
     * Get top PPPoE clients with most disconnections
     */
    async getTopPppoeDisconnectors(
        dateRange?: DateRange,
        limit: number = 10,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{ name: string; disconnectCount: number; lastDisconnect: Date; routerName: string }[]> {
        const range = dateRange || getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        const conditions: any[] = [
            eq(alerts.type, 'pppoe_disconnect'),
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) {
            conditions.push(eq(alerts.tenantId, tenantId));
        }

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            conditions.push(inArray(alerts.routerId, allowedIds));
        }

        // Extract PPPoE name from message and count disconnects
        const results = await db
            .select({
                pppoeTitle: alerts.title,
                disconnectCount: count(),
                lastDisconnect: sql<Date>`MAX(${alerts.createdAt})`,
                routerId: alerts.routerId,
            })
            .from(alerts)
            .where(and(...conditions))
            .groupBy(alerts.title, alerts.routerId)
            .orderBy(desc(count()))
            .limit(limit);

        // Get router names
        const withRouterNames = await Promise.all(
            results.map(async (r) => {
                const [router] = await db
                    .select({ name: routers.name })
                    .from(routers)
                    .where(eq(routers.id, r.routerId))
                    .limit(1);

                // Extract PPPoE name from title (format: "PPPoE: USERNAME disconnected")
                const titleMatch = r.pppoeTitle?.match(/^PPPoE: (.+) disconnected$/);
                const name = titleMatch?.[1] || r.pppoeTitle?.replace('PPPoE: ', '').replace(' disconnected', '') || 'Unknown';

                return {
                    name,
                    disconnectCount: Number(r.disconnectCount) || 0,
                    lastDisconnect: r.lastDisconnect,
                    routerName: router?.name || 'Unknown',
                };
            })
        );

        return withRouterNames;
    }

    /**
     * Get PPPoE clients that are currently down (recently disconnected and not in active sessions)
     */
    async getCurrentPppoeDownStatus(
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{ name: string; address: string; downSince: Date; routerName: string }[]> {
        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        // Get recent disconnect alerts (last 24 hours)
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);

        const conditions: any[] = [
            eq(alerts.type, 'pppoe_disconnect'),
            gte(alerts.createdAt, oneDayAgo),
        ];

        if (tenantId) {
            conditions.push(eq(alerts.tenantId, tenantId));
        }

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            conditions.push(inArray(alerts.routerId, allowedIds));
        }

        // Get all disconnect alerts
        const disconnects = await db
            .select({
                title: alerts.title,
                message: alerts.message,
                createdAt: alerts.createdAt,
                routerId: alerts.routerId,
            })
            .from(alerts)
            .where(and(...conditions))
            .orderBy(desc(alerts.createdAt));

        // Get all CURRENTLY ACTIVE sessions from pppoe_sessions table
        let activeSessionsQuery = db
            .select({ name: pppoeSessions.name, routerId: pppoeSessions.routerId })
            .from(pppoeSessions);

        const sessionFilters = [eq(pppoeSessions.status, 'active')];
        if (tenantId) sessionFilters.push(eq(pppoeSessions.tenantId, tenantId));

        if (routerId) {
            sessionFilters.push(eq(pppoeSessions.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin' && allowedIds.length > 0) {
            sessionFilters.push(inArray(pppoeSessions.routerId, allowedIds));
        }

        const activeSessions = await activeSessionsQuery.where(and(...sessionFilters)) as any;
        const activeSessionNames = new Set(activeSessions.map((s: any) => s.name));

        // Filter disconnects where client is NOT in active sessions (truly down)
        const downClients: { name: string; address: string; downSince: Date; routerName: string; routerId: string }[] = [];
        const seenNames = new Set<string>();

        for (const d of disconnects) {
            const titleMatch = d.title?.match(/^PPPoE: (.+) disconnected$/);
            const name = titleMatch?.[1] || d.title?.replace('PPPoE: ', '').replace(' disconnected', '') || 'Unknown';

            if (seenNames.has(name)) continue;

            if (!activeSessionNames.has(name)) {
                const ipMatch = d.message?.match(/IP: ([^\s,)]+)/);
                const address = ipMatch?.[1] || 'N/A';

                downClients.push({
                    name,
                    address,
                    downSince: d.createdAt,
                    routerName: '',
                    routerId: d.routerId,
                });
                seenNames.add(name);
            }
        }

        // Get router names
        const withRouterNames = await Promise.all(
            downClients.map(async (client) => {
                const [router] = await db
                    .select({ name: routers.name })
                    .from(routers)
                    .where(eq(routers.id, client.routerId))
                    .limit(1);

                return {
                    name: client.name,
                    address: client.address,
                    downSince: client.downSince,
                    routerName: router?.name || 'Unknown',
                };
            })
        );

        return withRouterNames.slice(0, 10);
    }

    /**
     * Get downtime analysis - devices with significant downtime
     */
    async getDowntimeAnalysis(
        dateRange?: DateRange,
        minDowntimeMinutes: number = 5,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{
        host: string | null;
        name: string | null;
        totalDowntimeMinutes: number;
        incidentCount: number;
        routerName: string;
    }[]> {
        const range = dateRange || getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        // Get netwatch entries
        const netwatchConditions: any[] = [];
        if (tenantId) netwatchConditions.push(eq(routerNetwatch.tenantId, tenantId));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            netwatchConditions.push(eq(routerNetwatch.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            netwatchConditions.push(inArray(routerNetwatch.routerId, allowedIds));
        }

        let query = db
            .select({
                host: routerNetwatch.host,
                name: routerNetwatch.name,
                lastDown: routerNetwatch.lastDown,
                lastUp: routerNetwatch.lastUp,
                status: routerNetwatch.status,
                routerId: routerNetwatch.routerId,
            })
            .from(routerNetwatch);

        if (netwatchConditions.length > 0) {
            query = query.where(and(...netwatchConditions)) as any;
        }

        const netwatchEntries = await query;

        // Count down incidents from alerts
        const alertConditions: any[] = [
            eq(alerts.type, 'netwatch_down'),
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) alertConditions.push(eq(alerts.tenantId, tenantId));

        if (routerId) {
            alertConditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin' && allowedIds.length > 0) {
            alertConditions.push(inArray(alerts.routerId, allowedIds));
        }

        const downAlerts = await db
            .select({
                message: alerts.message,
                createdAt: alerts.createdAt,
                resolvedAt: alerts.resolvedAt,
                resolved: alerts.resolved
            })
            .from(alerts)
            .where(and(...alertConditions));

        const hostIncidents = new Map<string, { count: number, durationMinutes: number }>();

        for (const alert of downAlerts) {
            const hostMatch = alert.message?.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (!hostMatch) continue;

            const host = hostMatch[1];
            let duration = 0;
            if (alert.resolved && alert.resolvedAt) {
                duration = (new Date(alert.resolvedAt).getTime() - new Date(alert.createdAt).getTime()) / (1000 * 60);
            } else {
                duration = (Date.now() - new Date(alert.createdAt).getTime()) / (1000 * 60);
            }

            const current = hostIncidents.get(host) || { count: 0, durationMinutes: 0 };
            hostIncidents.set(host, {
                count: current.count + 1,
                durationMinutes: current.durationMinutes + duration
            });
        }

        const results: { host: string | null; name: string | null; totalDowntimeMinutes: number; incidentCount: number; routerId: string }[] = [];

        for (const entry of netwatchEntries) {
            const host = entry.host;
            const historyData = host ? (hostIncidents.get(host) || { count: 0, durationMinutes: 0 }) : { count: 0, durationMinutes: 0 };
            let totalDowntime = historyData.durationMinutes;

            if (entry.status === 'down' && entry.lastDown) {
                if (historyData.count === 0) {
                    const currentDuration = (Date.now() - new Date(entry.lastDown).getTime()) / (1000 * 60);
                    totalDowntime += currentDuration;
                }
            }

            if (totalDowntime >= minDowntimeMinutes || historyData.count > 0) {
                results.push({
                    host: entry.host,
                    name: entry.name || entry.host,
                    totalDowntimeMinutes: Math.round(totalDowntime),
                    incidentCount: historyData.count,
                    routerId: entry.routerId,
                });
            }
        }

        const withRouterNames = await Promise.all(
            results.map(async (r) => {
                const [router] = await db
                    .select({ name: routers.name })
                    .from(routers)
                    .where(eq(routers.id, r.routerId))
                    .limit(1);

                return {
                    host: r.host,
                    name: r.name,
                    totalDowntimeMinutes: r.totalDowntimeMinutes,
                    incidentCount: r.incidentCount,
                    routerName: router?.name || 'Unknown',
                };
            })
        );

        return withRouterNames.sort((a, b) => b.totalDowntimeMinutes - a.totalDowntimeMinutes).slice(0, 20);
    }

    /**
     * Get incident heatmap data - geographic distribution of incidents
     */
    async getIncidentHeatmap(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{
        lat: number;
        lng: number;
        incidentCount: number;
        deviceNames: string[];
        routerName: string;
        routerId: string;
    }[]> {
        const range = dateRange || getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        // Get netwatch entries with coordinates
        const netwatchConditions: any[] = [];
        if (tenantId) netwatchConditions.push(eq(routerNetwatch.tenantId, tenantId));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            netwatchConditions.push(eq(routerNetwatch.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            netwatchConditions.push(inArray(routerNetwatch.routerId, allowedIds));
        }

        let netwatchQuery = db
            .select({
                host: routerNetwatch.host,
                name: routerNetwatch.name,
                latitude: routerNetwatch.latitude,
                longitude: routerNetwatch.longitude,
                routerId: routerNetwatch.routerId,
            })
            .from(routerNetwatch);

        if (netwatchConditions.length > 0) {
            netwatchQuery = netwatchQuery.where(and(...netwatchConditions)) as any;
        }

        const netwatchEntries = await netwatchQuery;

        // Count incidents per host
        const alertConditions: any[] = [
            eq(alerts.type, 'netwatch_down'),
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate),
        ];

        if (tenantId) alertConditions.push(eq(alerts.tenantId, tenantId));

        if (routerId) {
            alertConditions.push(eq(alerts.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin' && allowedIds.length > 0) {
            alertConditions.push(inArray(alerts.routerId, allowedIds));
        }

        const incidentCounts = await db
            .select({
                host: sql<string>`SUBSTRING(${alerts.message} FROM '(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})')`.as('host'),
                incidents: count(),
            })
            .from(alerts)
            .where(and(...alertConditions))
            .groupBy(sql`SUBSTRING(${alerts.message} FROM '(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})')`);

        const incidentMap = new Map(incidentCounts.map(i => [i.host, Number(i.incidents)]));

        const heatmapData: Map<string, { lat: number; lng: number; incidentCount: number; deviceNames: string[]; routerId: string }> = new Map();

        for (const entry of netwatchEntries) {
            const host = entry.host;
            const incidents = host ? (incidentMap.get(host) || 0) : 0;
            if (incidents === 0 || !entry.latitude || !entry.longitude) continue;

            const lat = parseFloat(entry.latitude as string);
            const lng = parseFloat(entry.longitude as string);
            if (isNaN(lat) || isNaN(lng)) continue;

            const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;

            if (heatmapData.has(key)) {
                const existing = heatmapData.get(key)!;
                existing.incidentCount += incidents;
                existing.deviceNames.push(entry.name || entry.host || 'Unknown');
            } else {
                heatmapData.set(key, {
                    lat,
                    lng,
                    incidentCount: incidents,
                    deviceNames: [entry.name || entry.host || 'Unknown'],
                    routerId: entry.routerId,
                });
            }
        }

        const results = await Promise.all(
            Array.from(heatmapData.values()).map(async (data) => {
                const [router] = await db
                    .select({ name: routers.name })
                    .from(routers)
                    .where(eq(routers.id, data.routerId))
                    .limit(1);

                return {
                    lat: data.lat,
                    lng: data.lng,
                    incidentCount: data.incidentCount,
                    deviceNames: data.deviceNames.slice(0, 5),
                    routerName: router?.name || 'Unknown',
                    routerId: data.routerId,
                };
            })
        );

        return results.sort((a, b) => b.incidentCount - a.incidentCount).slice(0, 50);
    }
}

export const availabilityAnalyticsService = new AvailabilityAnalyticsService();
