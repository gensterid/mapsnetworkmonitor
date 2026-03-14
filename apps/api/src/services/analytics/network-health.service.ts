import { eq, and, count, or, inArray, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, olts, routerNetwatch, alerts, routerInterfaces, routerMetrics } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';

export interface HealthScore {
    score: number;
    status: 'optimal' | 'warning' | 'critical';
    breakdown: {
        routers: { total: number; down: number; score: number };
        olts: { total: number; down: number; score: number };
        netwatch: { total: number; down: number; score: number };
    };
    criticalIssues: { ID: string; type: string; message: string; severity: string }[];
    stats: {
        totalTxRate: number; // bps
        totalRxRate: number; // bps
        avgCpuLoad: number;
        avgMemoryUsage: number;
    };
    timestamp: string;
}

export class NetworkHealthService {
    /**
     * Calculate overall network health score for a tenant
     */
    async calculateOverallHealth(tenantId?: string): Promise<HealthScore> {
        try {
            // 1. Fetch data in parallel
            const [routerStats, oltStats, netwatchStats, criticalAlerts, performanceStats] = await Promise.all([
                this.getDeviceStats(routers, tenantId),
                this.getDeviceStats(olts, tenantId),
                this.getDeviceStats(routerNetwatch, tenantId),
                this.getCriticalIssues(tenantId),
                this.getNetworkPerformance(tenantId)
            ]);

            // 2. Calculate individual scores (0-100)
            const routerScore = this.calculateDeviceScore(routerStats.total, routerStats.down);
            const oltScore = this.calculateDeviceScore(oltStats.total, oltStats.down);
            const netwatchScore = this.calculateDeviceScore(netwatchStats.total, netwatchStats.down);

            // 3. Weighted Score Calculation
            // Weights: Routers (40%), OLTs (30%), Netwatch (30%)
            // If a category has 0 devices, re-distribute weights or handle gracefully
            let finalScore = 0;
            let totalWeight = 0;

            if (routerStats.total > 0) {
                finalScore += routerScore * 0.4;
                totalWeight += 0.4;
            }
            if (oltStats.total > 0) {
                finalScore += oltScore * 0.3;
                totalWeight += 0.3;
            }
            if (netwatchStats.total > 0) {
                finalScore += netwatchScore * 0.3;
                totalWeight += 0.3;
            }

            // Normalize in case some categories are empty
            if (totalWeight > 0) {
                finalScore = Math.round(finalScore / totalWeight);
            } else {
                finalScore = 100; // No devices = perfectly healthy?
            }

            // 4. Determine Status
            let status: HealthScore['status'] = 'optimal';
            if (finalScore < 75) status = 'critical';
            else if (finalScore < 90) status = 'warning';

            return {
                score: finalScore,
                status,
                breakdown: {
                    routers: { ...routerStats, score: Math.round(routerScore) },
                    olts: { ...oltStats, score: Math.round(oltScore) },
                    netwatch: { ...netwatchStats, score: Math.round(netwatchScore) }
                },
                criticalIssues: criticalAlerts,
                stats: performanceStats,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error({ err: error, tenantId }, 'Failed to calculate network health score');
            throw error;
        }
    }

    private calculateDeviceScore(total: number, down: number): number {
        if (total === 0) return 100;
        return ((total - down) / total) * 100;
    }

    private async getDeviceStats(table: any, tenantId?: string) {
        const conditions = [];
        if (tenantId) conditions.push(eq(table.tenantId, tenantId));
        
        // Handle different status field naming if necessary
        // For routers/olts it's 'status', for netwatch it's 'status' but values differ
        const allDevices = await db.select().from(table).where(and(...conditions));
        
        const total = allDevices.length;
        const down = allDevices.filter((d: any) => {
            const s = String(d.status).toLowerCase();
            return s === 'offline' || s === 'down' || s === 'critical';
        }).length;

        return { total, down };
    }

    private async getCriticalIssues(tenantId?: string) {
        const conditions = [eq(alerts.resolved, false)];
        if (tenantId) conditions.push(eq(alerts.tenantId, tenantId));

        const activeAlerts = await db.select()
            .from(alerts)
            .where(and(...conditions))
            .orderBy(desc(alerts.createdAt))
            .limit(5);

        return activeAlerts.map(a => ({
            ID: a.id,
            type: a.type,
            message: a.message || '',
            severity: a.severity || 'warning'
        }));
    }

    private async getNetworkPerformance(tenantId?: string) {

        // Aggregate throughput from all active interfaces
        // Join with routers to filter by tenantId if provided
        const query = db.select({
            txRate: routerInterfaces.txRate,
            rxRate: routerInterfaces.rxRate
        }).from(routerInterfaces);

        if (tenantId) {
            query.innerJoin(routers, eq(routerInterfaces.routerId, routers.id))
                 .where(eq(routers.tenantId, tenantId));
        }

        const interfaces = await query;

        const totalTxRate = interfaces.reduce((sum, iface) => sum + (iface.txRate || 0), 0);
        const totalRxRate = interfaces.reduce((sum, iface) => sum + (iface.rxRate || 0), 0);

        // Get latest resource stats from routers
        const resourceConditions = [];
        if (tenantId) resourceConditions.push(eq(routerMetrics.tenantId, tenantId));

        const recentMetrics = await db.select()
            .from(routerMetrics)
            .where(and(...resourceConditions))
            .orderBy(desc(routerMetrics.recordedAt))
            .limit(50);

        const avgCpuLoad = recentMetrics.length > 0 
            ? recentMetrics.reduce((sum, m) => sum + (m.cpuLoad || 0), 0) / recentMetrics.length
            : 0;
            
        const avgMemoryUsage = recentMetrics.length > 0
            ? recentMetrics.reduce((sum, m) => {
                const total = m.totalMemory || 1;
                const used = m.usedMemory || 0;
                return sum + ((used / total) * 100);
            }, 0) / recentMetrics.length
            : 0;

        return {
            totalTxRate,
            totalRxRate,
            avgCpuLoad: Math.round(avgCpuLoad),
            avgMemoryUsage: Math.round(avgMemoryUsage)
        };
    }
}

export const networkHealthService = new NetworkHealthService();
