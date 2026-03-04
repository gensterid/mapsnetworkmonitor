import {
    type DateRange,
    type OverviewStats,
    type AlertTrend,
    type UptimeStats,
    type PerformanceData,
    type AuditLogEntry,
    getDefaultDateRange as getDefaultDateRangeUtil
} from './analytics/analytics-utils.js';
import { performanceAnalyticsService } from './analytics/performance-analytics.service.js';
import { eventAnalyticsService } from './analytics/event-analytics.service.js';
import { availabilityAnalyticsService } from './analytics/availability-analytics.service.js';

// Re-export types for backward compatibility
export type { DateRange, OverviewStats, AlertTrend, UptimeStats, PerformanceData, AuditLogEntry };

class AnalyticsService {
    /**
     * Get default date range (last 30 days)
     */
    getDefaultDateRange(): DateRange {
        return getDefaultDateRangeUtil();
    }

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
        return eventAnalyticsService.getOverviewStats(dateRange, routerId, userId, userRole, tenantId);
    }

    /**
     * Get alert trends by day
     */
    async getAlertTrends(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<AlertTrend[]> {
        return eventAnalyticsService.getAlertTrends(dateRange, routerId, userId, userRole, tenantId);
    }

    /**
     * Get uptime statistics per router
     */
    async getUptimeStats(
        dateRange?: DateRange,
        routerId?: string,
        userId?: string,
        userRole?: string,
        tenantId?: string
    ): Promise<UptimeStats[]> {
        return availabilityAnalyticsService.getUptimeStats(dateRange, routerId, userId, userRole, tenantId);
    }

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
        return performanceAnalyticsService.getPerformanceTrends(dateRange, routerId, userId, userRole, tenantId);
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
        return eventAnalyticsService.getAuditLogs(page, limit, dateRange, action, entity, tenantId);
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
        return eventAnalyticsService.getAlertsList(dateRange, routerId, userId, userRole, tenantId, limit, resolved);
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
        return availabilityAnalyticsService.getTopDownDevices(dateRange, limit, routerId, userId, userRole, tenantId);
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
        return availabilityAnalyticsService.getTopPppoeDisconnectors(dateRange, limit, routerId, userId, userRole, tenantId);
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
        return availabilityAnalyticsService.getCurrentPppoeDownStatus(routerId, userId, userRole, tenantId);
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
        return eventAnalyticsService.getIssuesAnalysis(dateRange, limit, routerId, userId, userRole, tenantId);
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
        return performanceAnalyticsService.getCpuPeakAnalysis(dateRange, routerId, userId, userRole, tenantId);
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
        host: string;
        name: string;
        totalDowntimeMinutes: number;
        incidentCount: number;
        routerName: string;
    }[]> {
        return availabilityAnalyticsService.getDowntimeAnalysis(dateRange, minDowntimeMinutes, routerId, userId, userRole, tenantId);
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
        return performanceAnalyticsService.getInterfaceCapacityAnalysis(dateRange, routerId, userId, userRole, tenantId);
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
        return availabilityAnalyticsService.getIncidentHeatmap(dateRange, routerId, userId, userRole, tenantId);
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
        bySeverity: {
            critical: number;
            warning: number;
            info: number;
        };
        fastestResolution: number;
        slowestResolution: number;
    }> {
        return eventAnalyticsService.getResolutionStats(dateRange, routerId, userId, userRole, tenantId);
    }
}

export const analyticsService = new AnalyticsService();
