import { sql, eq, and, gte, lte, desc, avg, or, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { devicePerformanceHistory, routers, onus, routerNetwatch } from '../../db/schema/index.js';

export interface PredictionResult {
    id: string;
    type: 'router' | 'onu';
    name: string;
    metrics: {
        latency: {
            current: number | null;
            trend: 'improving' | 'stable' | 'deteriorating';
            slope: number;
        };
        signal: {
            current: number | null;
            trend: 'improving' | 'stable' | 'deteriorating';
            slope: number;
        } | null;
    };
    riskLevel: 'low' | 'medium' | 'high';
}

export class PredictionService {
    /**
     * Calculate linear regression slope
     * Slope (m) = [n*Σ(xy) - Σx*Σy] / [n*Σ(x^2) - (Σx)^2]
     */
    private calculateSlope(data: { x: number; y: number }[]): number {
        const n = data.length;
        if (n < 10) return 0; // Need enough data points for a reliable trend

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const firstX = data[0].x;

        for (const point of data) {
            const x = (point.x - firstX) / (60 * 60 * 1000); // Scale x to hours for better numerical stability
            sumX += x;
            sumY += point.y;
            sumXY += x * point.y;
            sumX2 += x * x;
        }

        const denominator = (n * sumX2 - sumX * sumX);
        if (denominator === 0) return 0;

        return (n * sumXY - sumX * sumY) / denominator;
    }

    private getTrend(slope: number, type: 'latency' | 'signal'): 'improving' | 'stable' | 'deteriorating' {
        const threshold = type === 'latency' ? 0.05 : 0.01; // Change per hour threshold

        if (Math.abs(slope) < threshold) return 'stable';
        
        if (type === 'latency') {
            return slope > 0 ? 'deteriorating' : 'improving';
        } else {
            return slope < 0 ? 'deteriorating' : 'improving';
        }
    }

    async getPredictiveAnalytics(tenantId?: string): Promise<PredictionResult[]> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // 1. Get targets
        const rCond = tenantId ? eq(routers.tenantId, tenantId) : undefined;
        const oCond = tenantId ? eq(onus.tenantId, tenantId) : undefined;

        const activeRouters = await db.select({ id: routers.id, name: routers.name }).from(routers).where(rCond);
        const activeOnus = await db.select({ id: onus.id, name: onus.name }).from(onus).where(oCond);

        const routerIds = activeRouters.map(r => r.id);
        const onuIds = activeOnus.map(o => o.id);

        if (routerIds.length === 0 && onuIds.length === 0) return [];

        // 2. Batch fetch history for last 7 days
        const history = await db.select()
            .from(devicePerformanceHistory)
            .where(and(
                or(
                    routerIds.length > 0 ? inArray(devicePerformanceHistory.routerId, routerIds) : undefined,
                    onuIds.length > 0 ? inArray(devicePerformanceHistory.onuId, onuIds) : undefined
                ),
                gte(devicePerformanceHistory.recordedAt, sevenDaysAgo)
            ))
            .orderBy(devicePerformanceHistory.recordedAt);

        const results: PredictionResult[] = [];

        // 3. Process Routers
        for (const router of activeRouters) {
            const rHistory = history.filter(h => h.routerId === router.id && h.onuId === null);
            if (rHistory.length < 10) continue;

            const latencyData = rHistory
                .filter(h => h.latency !== null)
                .map(h => ({ x: h.recordedAt.getTime(), y: h.latency! }));

            if (latencyData.length < 10) continue;

            const slope = this.calculateSlope(latencyData);
            const trend = this.getTrend(slope, 'latency');

            results.push({
                id: router.id,
                type: 'router',
                name: router.name,
                metrics: {
                    latency: {
                        current: latencyData[latencyData.length - 1]?.y || 0,
                        trend,
                        slope
                    },
                    signal: null
                },
                riskLevel: trend === 'deteriorating' ? (Math.abs(slope) > 0.5 ? 'high' : 'medium') : 'low'
            });
        }

        // 4. Process ONUs
        for (const onu of activeOnus) {
            const oHistory = history.filter(h => h.onuId === onu.id);
            if (oHistory.length < 10) continue;

            const latencyData = oHistory
                .filter(h => h.latency !== null)
                .map(h => ({ x: h.recordedAt.getTime(), y: h.latency! }));

            const signalData = oHistory
                .filter(h => h.signal !== null)
                .map(h => ({ x: h.recordedAt.getTime(), y: h.signal! }));

            const lSlope = latencyData.length >= 10 ? this.calculateSlope(latencyData) : 0;
            const sSlope = signalData.length >= 10 ? this.calculateSlope(signalData) : 0;

            const lTrend = this.getTrend(lSlope, 'latency');
            const sTrend = this.getTrend(sSlope, 'signal');

            results.push({
                id: onu.id,
                type: 'onu',
                name: onu.name || 'Unknown ONU',
                metrics: {
                    latency: {
                        current: latencyData[latencyData.length - 1]?.y || 0,
                        trend: lTrend,
                        slope: lSlope
                    },
                    signal: {
                        current: signalData[signalData.length - 1]?.y || 0,
                        trend: sTrend,
                        slope: sSlope
                    }
                },
                riskLevel: (lTrend === 'deteriorating' || sTrend === 'deteriorating') ? 'high' : 'low'
            });
        }

        return results;
    }
}

export const predictionService = new PredictionService();
