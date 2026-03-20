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
/**
 * Normalize date range to the nearest 5-minute interval.
 * This prevents "cache key explosion" where every millisecond difference
 * creates a new cache entry.
 */
export function normalizeDateRange(range: DateRange): { start: number; end: number } {
    const roundTo = 5 * 60 * 1000; // 5 minutes in ms
    return {
        start: Math.floor(range.startDate.getTime() / roundTo) * roundTo,
        end: Math.floor(range.endDate.getTime() / roundTo) * roundTo,
    };
}
/**
 * Standardize various timestamp formats for frontend consumption.
 * Ensures: 
 * 1. Date objects become ISO strings.
 * 2. Space between date and time is replaced with 'T'.
 * 3. Timezone offsets like +08 are normalized to +08:00 (required by some JS engines).
 * 4. Missing timezone assumes UTC (ends with Z).
 */
export function formatAnalyticsTimestamp(ts: any): string {
    if (!ts) return '';
    if (ts instanceof Date) return ts.toISOString();
    
    let str = String(ts);
    // Replace space with T
    str = str.replace(' ', 'T');
    
    if (str.endsWith('Z')) return str;

    // Check for timezone offset (+HH or +HH:mm)
    // Supports formats like +08, +0800, +08:00, -05, etc.
    const offsetMatch = str.match(/([+-]\d{2}):?(\d{2})?$/);
    if (offsetMatch) {
        const [full, hours, minutes] = offsetMatch;
        if (!minutes) {
            // Convert +08 to +08:00
            return str.replace(full, `${hours}:00`);
        }
        if (full.indexOf(':') === -1) {
            // Convert +0800 to +08:00
            return str.replace(full, `${hours}:${minutes}`);
        }
        return str;
    }

    // If no offset and no Z, append Z
    if (!str.includes('Z')) {
        return str + 'Z';
    }

    return str;
}
