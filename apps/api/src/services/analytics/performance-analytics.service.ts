import { sql, eq, and, or, gte, lte, desc, avg, inArray, ilike } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, routerMetrics, devicePerformanceHistory, onus, routerNetwatch } from '../../db/schema/index.js';
import {
    type DateRange,
    type PerformanceData,
    getDefaultDateRange,
    getAllowedRouterIds,
    normalizeDateRange,
    formatAnalyticsTimestamp
} from './analytics-utils.js';
import { cacheService } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';

export class PerformanceAnalyticsService {
    /**
     * Get performance trends (CPU/Memory average by hour)
     */
    async getPerformanceTrends(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<PerformanceData[]> {
        const range = dateRange || getDefaultDateRange();
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:perf_trends:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${normalized.start}-${normalized.end}`;
        const cached = await cacheService.get<PerformanceData[]>(cacheKey);
        if (cached) return cached;

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        const conditions: any[] = [
            gte(routerMetrics.recordedAt, range.startDate),
            lte(routerMetrics.recordedAt, range.endDate),
        ];

        if (tenantId) {
            conditions.push(eq(routerMetrics.tenantId, tenantId));
        }

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(routerMetrics.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            conditions.push(inArray(routerMetrics.routerId, allowedIds));
        }

        let query = db
            .select({
                timestamp: sql<any>`DATE_TRUNC('hour', ${routerMetrics.recordedAt})`.as('timestamp'),
                avgCpu: avg(routerMetrics.cpuLoad),
                avgMemory: sql<number>`AVG(CASE WHEN ${routerMetrics.totalMemory} > 0 THEN (${routerMetrics.usedMemory}::float / ${routerMetrics.totalMemory}::float * 100) ELSE 0 END)`,
            })
            .from(routerMetrics)
            .where(and(...conditions))
            .groupBy(sql`DATE_TRUNC('hour', ${routerMetrics.recordedAt})`)
            .orderBy(sql`DATE_TRUNC('hour', ${routerMetrics.recordedAt})`);

        const results = await query;

        const data = results.map(r => ({
            timestamp: formatAnalyticsTimestamp(r.timestamp),
            avgCpu: Math.round((Number(r.avgCpu) || 0) * 10) / 10,
            avgMemory: Math.round((Number(r.avgMemory) || 0) * 10) / 10,
        }));

        // Cache for 5 minutes
        await cacheService.set(cacheKey, data, 300);

        return data;
    }

    /**
     * Get CPU peak analysis - routers with high CPU during peak hours
     */
    async getCpuPeakAnalysis(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{
        routerId: string;
        routerName: string;
        hour: number;
        avgCpu: number;
        peakCount: number;
    }[]> {
        const range = dateRange || getDefaultDateRange();
        const normalized = normalizeDateRange(range);

        const cacheKey = `analytics:cpu_peak:${tenantId || 'global'}:${userId || 'none'}:${routerId || 'all'}:${normalized.start}-${normalized.end}`;
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) return cached;

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        const conditions: any[] = [
            gte(routerMetrics.recordedAt, range.startDate),
            lte(routerMetrics.recordedAt, range.endDate),
        ];

        if (tenantId) {
            conditions.push(eq(routerMetrics.tenantId, tenantId));
        }

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            conditions.push(eq(routerMetrics.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            conditions.push(inArray(routerMetrics.routerId, allowedIds));
        }

        // Group by router and hour, count peaks (CPU > 90%)
        const results = await db
            .select({
                routerId: routerMetrics.routerId,
                hour: sql<number>`EXTRACT(HOUR FROM ${routerMetrics.recordedAt})`.as('hour'),
                avgCpu: avg(routerMetrics.cpuLoad),
                peakCount: sql<number>`SUM(CASE WHEN ${routerMetrics.cpuLoad} > 90 THEN 1 ELSE 0 END)`,
            })
            .from(routerMetrics)
            .where(and(...conditions))
            .groupBy(routerMetrics.routerId, sql`EXTRACT(HOUR FROM ${routerMetrics.recordedAt})`)
            .orderBy(desc(sql`SUM(CASE WHEN ${routerMetrics.cpuLoad} > 90 THEN 1 ELSE 0 END)`));

        // Get router names
        const withNames = await Promise.all(
            results.map(async (r) => {
                const [router] = await db
                    .select({ name: routers.name })
                    .from(routers)
                    .where(eq(routers.id, r.routerId))
                    .limit(1);

                return {
                    routerId: r.routerId,
                    routerName: router?.name || 'Unknown',
                    hour: Number(r.hour),
                    avgCpu: Math.round((Number(r.avgCpu) || 0) * 10) / 10,
                    peakCount: Number(r.peakCount) || 0,
                };
            })
        );

        // Filter only those with peaks and sort by peak count
        const finalResults = withNames.filter(r => r.peakCount > 0).slice(0, 20);

        // Cache for 5 minutes
        await cacheService.set(cacheKey, finalResults, 300);

        return finalResults;
    }

    /**
     * Get interface capacity analysis - interfaces approaching bottleneck
     */
    async getInterfaceCapacityAnalysis(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<{
        interfaceName: string;
        routerName: string;
        routerId: string;
        speed: string;
        avgTxMbps: number;
        avgRxMbps: number;
        utilizationPercent: number;
    }[]> {
        const range = dateRange || getDefaultDateRange();

        let allowedIds: string[] = [];
        if (userId && userRole) {
            allowedIds = await getAllowedRouterIds(userId, userRole, tenantId);
            if (allowedIds.length === 0 && userRole !== 'superadmin') return [];
        }

        // Import routerInterfaces from schema
        const { routerInterfaces } = await import('../../db/schema/index.js');

        // Get interfaces with their current rates
        let query = db
            .select({
                name: routerInterfaces.name,
                routerId: routerInterfaces.routerId,
                speed: routerInterfaces.speed,
                txRate: routerInterfaces.txRate,
                rxRate: routerInterfaces.rxRate,
                running: routerInterfaces.running,
            })
            .from(routerInterfaces)
            .innerJoin(routers, eq(routerInterfaces.routerId, routers.id));

        const capacityConditions: any[] = [];
        if (tenantId) capacityConditions.push(eq(routers.tenantId, tenantId));

        if (routerId) {
            if (userRole !== 'admin' && userRole !== 'superadmin' && !allowedIds.includes(routerId)) {
                throw new Error('Access denied to this router');
            }
            capacityConditions.push(eq(routerInterfaces.routerId, routerId));
        } else if (userRole !== 'admin' && userRole !== 'superadmin') {
            capacityConditions.push(inArray(routerInterfaces.routerId, allowedIds));
        }

        if (capacityConditions.length > 0) {
            query = query.where(and(...capacityConditions)) as any;
        }

        const interfaces = await query;

        // Calculate utilization for each interface
        const results: { interfaceName: string; routerId: string; speed: string; avgTxMbps: number; avgRxMbps: number; utilizationPercent: number }[] = [];

        for (const iface of interfaces) {
            if (!iface.running) continue; // Skip disabled/inactive interfaces

            // Parse speed (e.g., "1Gbps", "100Mbps")
            let speedMbps = 1000; // Default 1Gbps
            if (iface.speed) {
                const speedMatch = iface.speed.match(/(\d+)([GMK])?bps/i);
                if (speedMatch) {
                    const value = parseInt(speedMatch[1]);
                    const unit = speedMatch[2]?.toUpperCase();
                    if (unit === 'G') speedMbps = value * 1000;
                    else if (unit === 'M') speedMbps = value;
                    else if (unit === 'K') speedMbps = value / 1000;
                    else speedMbps = value;
                }
            }

            // Convert bits/sec to Mbps
            const txMbps = ((iface.txRate || 0) / 1000000);
            const rxMbps = ((iface.rxRate || 0) / 1000000);
            const maxRate = Math.max(txMbps, rxMbps);
            const utilization = speedMbps > 0 ? (maxRate / speedMbps) * 100 : 0;

            if (utilization > 10) { // Only show interfaces with >10% utilization
                results.push({
                    interfaceName: iface.name,
                    routerId: iface.routerId,
                    speed: iface.speed || 'Unknown',
                    avgTxMbps: Math.round(txMbps * 10) / 10,
                    avgRxMbps: Math.round(rxMbps * 10) / 10,
                    utilizationPercent: Math.round(utilization * 10) / 10,
                });
            }
        }

        // Get router names
        const withRouterNames = await Promise.all(
            results.map(async (r) => {
                const [router] = await db
                    .select({ name: routers.name })
                    .from(routers)
                    .where(eq(routers.id, r.routerId))
                    .limit(1);

                return {
                    interfaceName: r.interfaceName,
                    routerName: router?.name || 'Unknown',
                    routerId: r.routerId,
                    speed: r.speed,
                    avgTxMbps: r.avgTxMbps,
                    avgRxMbps: r.avgRxMbps,
                    utilizationPercent: r.utilizationPercent,
                };
            })
        );

        // Sort by utilization descending
        return withRouterNames.sort((a, b) => b.utilizationPercent - a.utilizationPercent).slice(0, 20);
    }

    /**
     * Get device-specific performance trends (Latency & Signal)
     */
    async getDevicePerformanceTrends(
        params: {
            routerId?: string;
            host?: string; // IP for Netwatch
            onuId?: string; // ID for ONU
            startDate: Date;
            endDate: Date;
            tenantId?: string;
        }
    ): Promise<any[]> {
        const { routerId, host: paramHost, onuId: paramOnuId, startDate, endDate, tenantId } = params;
        let host = paramHost;
        let onuId = paramOnuId;

        // Auto-resolve ONU ID if we only have host, or host if we only have ONU ID
        // This ensures both latency (tracked by host) and signal (tracked by onuId) are returned
        if (host && !onuId) {
            const [matchedOnu] = await db.select({ id: onus.id }).from(onus).where(eq(onus.host, host)).limit(1);
            if (matchedOnu) {
                onuId = matchedOnu.id;
            } else {
                // FALLBACK: Check routerNetwatch for a link
                const [matchedNetwatch] = await db.select({ linkedOnuId: routerNetwatch.linkedOnuId })
                    .from(routerNetwatch)
                    .where(eq(routerNetwatch.host, host))
                    .limit(1);
                if (matchedNetwatch?.linkedOnuId) onuId = matchedNetwatch.linkedOnuId;
            }
        } else if (onuId && !host) {
            const [matchedOnu] = await db.select({ host: onus.host }).from(onus).where(eq(onus.id, onuId)).limit(1);
            if (matchedOnu?.host) {
                host = matchedOnu.host;
            } else {
                // FALLBACK: Check routerNetwatch for a link back to this ONU
                const [matchedNetwatch] = await db.select({ host: routerNetwatch.host })
                    .from(routerNetwatch)
                    .where(eq(routerNetwatch.linkedOnuId, onuId))
                    .limit(1);
                if (matchedNetwatch?.host) host = matchedNetwatch.host;
            }
        }

        const conditions: any[] = [
            gte(devicePerformanceHistory.recordedAt, startDate),
            lte(devicePerformanceHistory.recordedAt, endDate),
        ];

        if (tenantId) conditions.push(eq(devicePerformanceHistory.tenantId, tenantId));
        if (routerId) conditions.push(eq(devicePerformanceHistory.routerId, routerId));

        const hosts = new Set<string>();
        if (host) hosts.add(host);

        if (onuId) {
            // 1. Find hosts linked via explicit linkage field
            const linkedNetwatch = await db.select({ host: routerNetwatch.host })
                .from(routerNetwatch)
                .where(eq(routerNetwatch.linkedOnuId, onuId));
            
            for (const nw of linkedNetwatch) {
                if (nw.host && nw.host !== '0.0.0.0') hosts.add(nw.host);
            }

            // 2. FALLBACK: Look at the ONU's own host field
            const [onu] = await db.select({ host: onus.host, name: onus.name }).from(onus).where(eq(onus.id, onuId));
            if (onu?.host && onu.host !== '0.0.0.0') hosts.add(onu.host);

            // 3. AGGRESSIVE FALLBACK: Match by name similarity in Netwatch
            if (onu?.name) {
                const nameMatches = await db.select({ host: routerNetwatch.host })
                    .from(routerNetwatch)
                    .where(and(
                        eq(routerNetwatch.routerId, routerId || ''),
                        ilike(routerNetwatch.name, onu.name)
                    ));
                
                for (const nm of nameMatches) {
                    if (nm.host && nm.host !== '0.0.0.0') hosts.add(nm.host);
                }
            }
        }

        // Final ID conditions: either the specific ONU ID or any of these hosts
        const idConditions: any[] = [];
        if (onuId) idConditions.push(eq(devicePerformanceHistory.onuId, onuId));
        for (const h of hosts) {
            idConditions.push(eq(devicePerformanceHistory.host, h));
        }

        if (idConditions.length === 0) {
            return [];
        }

        conditions.push(or(...idConditions));

        // Determine grouping interval based on range
        const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        let timeSelect: any;
        if (diffDays > 7) {
            // Group by 3 hours (10800 seconds) - safely using epoch math to avoid PG interval string errors
            timeSelect = sql<string>`to_timestamp(floor(extract('epoch' from ${devicePerformanceHistory.recordedAt}) / 10800) * 10800) AT TIME ZONE 'UTC'`;
        } else {
            // Group by 1 hour using standard PG interval 'hour'
            timeSelect = sql<string>`DATE_TRUNC('hour', ${devicePerformanceHistory.recordedAt})`;
        }

        const results = await db
            .select({
                timestamp: timeSelect.as('timestamp'),
                avgLatency: avg(devicePerformanceHistory.latency),
                avgSignal: avg(devicePerformanceHistory.signal),
                error: sql<string>`MAX(${devicePerformanceHistory.errorMessage})`
            })
            .from(devicePerformanceHistory)
            .where(and(...conditions))
            .groupBy(timeSelect)
            .orderBy(timeSelect);

        return results.map(r => ({
            timestamp: formatAnalyticsTimestamp(r.timestamp),
            latency: r.avgLatency !== null ? Math.round(Number(r.avgLatency) * 10) / 10 : null,
            signal: r.avgSignal !== null ? Math.round(Number(r.avgSignal) * 100) / 100 : null,
            error: r.error || null
        }));
    }

    /**
     * Get interface performance trends (TX/RX rates)
     */
    async getInterfacePerformanceTrends(
        params: {
            interfaceId: string;
            startDate: Date;
            endDate: Date;
            tenantId?: string;
        }
    ): Promise<any[]> {
        const { interfaceId, startDate, endDate, tenantId } = params;
        const { routerInterfaceMetrics } = await import('../../db/schema/index.js');

        const conditions: any[] = [
            eq(routerInterfaceMetrics.interfaceId, interfaceId),
            gte(routerInterfaceMetrics.recordedAt, startDate),
            lte(routerInterfaceMetrics.recordedAt, endDate),
        ];

        if (tenantId) conditions.push(eq(routerInterfaceMetrics.tenantId, tenantId));

        // Determine grouping interval based on range
        const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        let timeSelect: any;
        if (diffDays > 7) {
            // 3-hour grouping for > 7 days
            timeSelect = sql<string>`DATE_TRUNC('hour', ${routerInterfaceMetrics.recordedAt}) - (CAST(EXTRACT(HOUR FROM ${routerInterfaceMetrics.recordedAt} AT TIME ZONE 'UTC') AS INTEGER) % 3) * INTERVAL '1 hour'`;
        } else if (diffDays > 2) {
            // 1-hour grouping for 2-7 days
            timeSelect = sql<string>`DATE_TRUNC('hour', ${routerInterfaceMetrics.recordedAt})`;
        } else {
            // 15-minute grouping for < 2 days for more detail
            timeSelect = sql<string>`to_timestamp(floor(extract('epoch' from ${routerInterfaceMetrics.recordedAt}) / 900) * 900) AT TIME ZONE 'UTC'`;
        }

        const results = await db
            .select({
                timestamp: timeSelect.as('timestamp'),
                avgTx: avg(routerInterfaceMetrics.txRate),
                avgRx: avg(routerInterfaceMetrics.rxRate),
            })
            .from(routerInterfaceMetrics)
            .where(and(...conditions))
            .groupBy(timeSelect)
            .orderBy(timeSelect);

        return results.map(r => ({
            timestamp: formatAnalyticsTimestamp(r.timestamp),
            txRate: r.avgTx !== null ? Math.round(Number(r.avgTx)) : 0,
            rxRate: r.avgRx !== null ? Math.round(Number(r.avgRx)) : 0,
        }));
    }
}

export const performanceAnalyticsService = new PerformanceAnalyticsService();
