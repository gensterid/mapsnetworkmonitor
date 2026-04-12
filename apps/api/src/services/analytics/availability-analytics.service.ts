import { sql, eq, and, gte, lte, desc, count, inArray, or, ilike, isNotNull } from 'drizzle-orm';
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
        const routerIdsArray = routerList.map(r => r.id);
        
        if (routerIdsArray.length === 0) return [];

        // Batch fetch all relevant incidents for these routers
        const incidentConditions = [
            inArray(alerts.routerId, routerIdsArray),
            gte(alerts.createdAt, range.startDate),
            lte(alerts.createdAt, range.endDate)
        ];

        if (search) {
            const searchTerm = `%${search}%`;
            incidentConditions.push(
                eq(alerts.type, 'netwatch_down'),
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

        const allIncidents = await db
            .select({
                routerId: alerts.routerId,
                createdAt: alerts.createdAt,
                resolvedAt: alerts.resolvedAt,
                resolved: alerts.resolved,
            })
            .from(alerts)
            .where(and(...incidentConditions) as any);

        // Group incidents by routerId
        const incidentsByRouter = new Map<string, typeof allIncidents>();
        allIncidents.forEach(inc => {
            const list = incidentsByRouter.get(inc.routerId) || [];
            list.push(inc);
            incidentsByRouter.set(inc.routerId, list);
        });

        const stats: UptimeStats[] = [];
        const totalMinutesInRange = (new Date(range.endDate).getTime() - new Date(range.startDate).getTime()) / (1000 * 60);

        for (const router of routerList) {
            const incidents = incidentsByRouter.get(router.id) || [];
            const incidentCount = incidents.length;
            let totalDowntimeMinutes = 0;

            for (const incident of incidents) {
                const start = incident.createdAt;
                let end = incident.resolved && incident.resolvedAt ? incident.resolvedAt : new Date();
                if (end > range.endDate) end = range.endDate;

                const durationMs = new Date(end).getTime() - new Date(start).getTime();
                totalDowntimeMinutes += Math.max(0, durationMs / (1000 * 60));
            }

            // Fallback: If no specific DOWN alerts found but we had incidents
            // and we're not in search mode (which uses specific netwatch_down alerts)
            if (incidentCount > 0 && totalDowntimeMinutes === 0 && !search) {
                totalDowntimeMinutes = incidentCount * 5; // Assume 5 mins per flip fallback
            }

            // Calculate uptime percentage
            const uptimePercentage = totalMinutesInRange > 0
                ? Math.round(((totalMinutesInRange - totalDowntimeMinutes) / totalMinutesInRange) * 100 * 10) / 10
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
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:top_down:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${normalized.start}-${normalized.end}:${limit}`;
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) return cached;

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

        // Get device names in batch
        const hosts = results.map(r => r.host).filter((h): h is string => !!h);
        const deviceNamesMap = new Map<string, string>();
        
        if (hosts.length > 0) {
            const devices = await db
                .select({ host: routerNetwatch.host, name: routerNetwatch.name })
                .from(routerNetwatch)
                .where(inArray(routerNetwatch.host, hosts));
            
            devices.forEach(d => {
                if (d.host) deviceNamesMap.set(d.host, d.name || d.host);
            });
        }

        const finalResults = results
            .filter(r => !!r.host)
            .map(r => ({
                name: deviceNamesMap.get(r.host!) || r.host!,
                host: r.host!,
                incidents: Number(r.incidents) || 0,
            }));

        // Cache for 5 minutes
        await cacheService.set(cacheKey, finalResults, 300);

        return finalResults;
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
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:top_pppoe_discon:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${normalized.start}-${normalized.end}:${limit}`;
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) return cached;

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

        // Get router names in batch
        const routerIds = [...new Set(results.map(r => r.routerId))];
        const routerNamesMap = new Map<string, string>();
        
        if (routerIds.length > 0) {
            const routerList = await db
                .select({ id: routers.id, name: routers.name })
                .from(routers)
                .where(inArray(routers.id, routerIds));
            
            routerList.forEach(r => routerNamesMap.set(r.id, r.name));
        }

        const withRouterNames = results.map((r) => {
            // Extract PPPoE name from title (format: "PPPoE: USERNAME disconnected")
            const titleMatch = r.pppoeTitle?.match(/^PPPoE: (.+) disconnected$/);
            const name = titleMatch?.[1] || r.pppoeTitle?.replace('PPPoE: ', '').replace(' disconnected', '') || 'Unknown';

            return {
                name,
                disconnectCount: Number(r.disconnectCount) || 0,
                lastDisconnect: r.lastDisconnect,
                routerName: routerNamesMap.get(r.routerId) || 'Unknown',
            };
        });

        // Cache for 5 minutes
        await cacheService.set(cacheKey, withRouterNames, 300);

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
        const cacheKey = `analytics:current_pppoe_down:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}`;
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) return cached;

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

        // Get router names in batch
        const routerIdsArray = [...new Set(downClients.map(c => c.routerId))];
        const routerMap = new Map<string, string>();
        
        if (routerIdsArray.length > 0) {
            const routerList = await db
                .select({ id: routers.id, name: routers.name })
                .from(routers)
                .where(inArray(routers.id, routerIdsArray));
            
            routerList.forEach(r => routerMap.set(r.id, r.name));
        }

        const finalResults = downClients.map((client) => {
            return {
                name: client.name,
                address: client.address,
                downSince: client.downSince,
                routerName: routerMap.get(client.routerId) || 'Unknown',
            };
        }).slice(0, 10);

        // Cache for 1 minute (status changes frequently)
        await cacheService.set(cacheKey, finalResults, 60);

        return finalResults;
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
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:downtime_analysis:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${normalized.start}-${normalized.end}:${minDowntimeMinutes}`;
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) return cached;

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

        // Get router names in batch
        const routerIdsArray = [...new Set(results.map(r => r.routerId))];
        const routerMap = new Map<string, string>();
        
        if (routerIdsArray.length > 0) {
            const routerList = await db
                .select({ id: routers.id, name: routers.name })
                .from(routers)
                .where(inArray(routers.id, routerIdsArray));
            
            routerList.forEach(r => routerMap.set(r.id, r.name));
        }

        const withRouterNames = results.map((r) => {
            return {
                host: r.host,
                name: r.name,
                totalDowntimeMinutes: r.totalDowntimeMinutes,
                incidentCount: r.incidentCount,
                routerName: routerMap.get(r.routerId) || 'Unknown',
            };
        });

        const finalResults = withRouterNames.sort((a, b) => b.totalDowntimeMinutes - a.totalDowntimeMinutes).slice(0, 20);

        // Cache for 5 minutes
        await cacheService.set(cacheKey, finalResults, 300);

        return finalResults;
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
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:incident_heatmap:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${normalized.start}-${normalized.end}`;
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) return cached;

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

        // Get router names in batch
        const routerIds = [...new Set(Array.from(heatmapData.values()).map(d => d.routerId))];
        const routerNamesMap = new Map<string, string>();

        if (routerIds.length > 0) {
            const routerList = await db
                .select({ id: routers.id, name: routers.name })
                .from(routers)
                .where(inArray(routers.id, routerIds));
            
            routerList.forEach(r => routerNamesMap.set(r.id, r.name));
        }

        const results = Array.from(heatmapData.values()).map((data) => {
            return {
                lat: data.lat,
                lng: data.lng,
                incidentCount: data.incidentCount,
                deviceNames: data.deviceNames.slice(0, 5),
                routerName: routerNamesMap.get(data.routerId) || 'Unknown',
                routerId: data.routerId,
            };
        });

        const finalResults = results.sort((a, b) => b.incidentCount - a.incidentCount).slice(0, 50);

        // Cache for 5 minutes
        await cacheService.set(cacheKey, finalResults, 300);

        return finalResults;
    }

    /**
     * Get ODP port capacity statistics
     */
    async getOdpCapacityStats(
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<any> {
        const cacheKey = `analytics:odp_capacity:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}`;
        const cached = await cacheService.get<any>(cacheKey);
        if (cached) return cached;

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') {
                return { totalOdp: 0, totalPorts: 0, usedPorts: 0, topFullOdp: [] };
            }
        }

        // 1. Get all ODPs
        const odpQuery = db.select({
            id: routerNetwatch.id,
            name: routerNetwatch.name,
            routerId: routerNetwatch.routerId,
            routerName: routers.name,
            portCapacity: routerNetwatch.portCapacity,
            splitterRatio: routerNetwatch.splitterRatio,
        })
        .from(routerNetwatch)
        .leftJoin(routers, eq(routerNetwatch.routerId, routers.id))
        .where(
            and(
                eq(routerNetwatch.deviceType, 'odp'),
                tenantId ? eq(routerNetwatch.tenantId, tenantId) : undefined,
                routerId ? eq(routerNetwatch.routerId, routerId) : (userRole !== 'admin' && userRole !== 'superadmin' ? inArray(routerNetwatch.routerId, allowedIds) : undefined)
            ) as any
        );

        const allOdps = await odpQuery;
        if (allOdps.length === 0) {
            return { totalOdp: 0, totalPorts: 0, usedPorts: 0, topFullOdp: [] };
        }

        // 2. Aggregate child counts (Netwatch)
        const netwatchConnections = await db.select({
            parentId: routerNetwatch.connectedToId,
            count: count()
        })
        .from(routerNetwatch)
        .where(
            and(
                isNotNull(routerNetwatch.connectedToId),
                sql`${routerNetwatch.deviceType} != 'odp'`
            ) as any
        )
        .groupBy(routerNetwatch.connectedToId);

        // 3. Aggregate child counts (PPPoE)
        const pppoeConnections = await db.select({
            parentId: pppoeSessions.connectedToId,
            count: count()
        })
        .from(pppoeSessions)
        .where(and(isNotNull(pppoeSessions.connectedToId), eq(pppoeSessions.status, 'active')))
        .groupBy(pppoeSessions.connectedToId);

        // 4. Map them
        const connectionMap = new Map<string, number>();
        netwatchConnections.forEach(c => {
            if (c.parentId) connectionMap.set(c.parentId, (connectionMap.get(c.parentId) || 0) + Number(c.count));
        });
        pppoeConnections.forEach(c => {
            if (c.parentId) connectionMap.set(c.parentId, (connectionMap.get(c.parentId) || 0) + Number(c.count));
        });

        // 5. Build final list and stats
        let totalPorts = 0;
        let usedPorts = 0;
        const odpList = allOdps.map(odp => {
            const used = connectionMap.get(odp.id) || 0;
            const capacity = odp.portCapacity || 8;
            totalPorts += capacity;
            usedPorts += used;

            return {
                id: odp.id,
                name: odp.name || 'Unknown ODP',
                routerName: odp.routerName || 'Unknown Router',
                usedPorts: used,
                portCapacity: capacity,
                splitterRatio: odp.splitterRatio || null,
                utilizationPercent: capacity > 0 ? Math.round((used / capacity) * 100) : 0
            };
        });

        // Sort by utilization to get top full ones
        const topFullOdp = odpList
            .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
            .slice(0, 5);

        const finalResults = {
            totalOdp: allOdps.length,
            totalPorts,
            usedPorts,
            utilizationPercent: totalPorts > 0 ? Math.round((usedPorts / totalPorts) * 100) : 0,
            topFullOdp
        };

        // Cache for 5 minutes
        await cacheService.set(cacheKey, finalResults, 300);

        return finalResults;
    }
}

export const availabilityAnalyticsService = new AvailabilityAnalyticsService();
