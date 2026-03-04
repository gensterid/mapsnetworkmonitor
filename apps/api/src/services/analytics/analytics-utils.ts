import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, userRouters } from '../../db/schema/index.js';

export interface DateRange {
    startDate: Date;
    endDate: Date;
}

export interface PerformanceData {
    timestamp: string;
    avgCpu: number;
    avgMemory: number;
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
    pppoeConnects: number;
    pppoeDisconnects: number;
}

export interface AlertTrend {
    date: string;
    total: number;
    critical: number;
    warning: number;
    info: number;
    pppoeConnect: number;
    pppoeDisconnect: number;
}

export interface UptimeStats {
    routerId: string;
    routerName: string;
    totalDowntime: number; // in minutes
    incidentCount: number;
    uptimePercentage: number;
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

/**
 * Get default date range (last 30 days)
 */
export function getDefaultDateRange(): DateRange {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return { startDate, endDate };
}

/**
 * Get allowed router IDs for a user within a tenant
 */
export async function getAllowedRouterIds(userId: string, userRole: string, tenantId?: string): Promise<string[]> {
    // If no tenantId, we can't filter effectively here, but callers should handle it
    if (!tenantId) return [];

    if (userRole === 'admin' || userRole === 'superadmin') {
        // Admins can see all routers in the tenant
        const tenantRouters = await db
            .select({ id: routers.id })
            .from(routers)
            .where(eq(routers.tenantId, tenantId));
        return tenantRouters.map(r => r.id);
    }

    // Operators can only see assigned routers within the tenant
    const assigned = await db
        .select({ routerId: userRouters.routerId })
        .from(userRouters)
        .innerJoin(routers, eq(userRouters.routerId, routers.id))
        .where(and(
            eq(userRouters.userId, userId),
            eq(routers.tenantId, tenantId)
        ));

    return assigned.map(a => a.routerId);
}
