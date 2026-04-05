import { eq, and, desc, inArray, sql, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { 
    routerMetrics, 
    routerInterfaceMetrics, 
    type RouterMetric, 
    type NewRouterMetric 
} from '../db/schema/index.js';

/**
 * Metric Repository - handles time-series data for routers and interfaces
 * Prepared for PostgreSQL declarative partitioning.
 */
export class MetricRepository {
    private static instance: MetricRepository;

    private constructor() {}

    public static getInstance(): MetricRepository {
        if (!MetricRepository.instance) {
            MetricRepository.instance = new MetricRepository();
        }
        return MetricRepository.instance;
    }

    /**
     * Find latest metrics for multiple routers
     */
    async findLatestForRouters(routerIds: string[], tx: any = db): Promise<any[]> {
        if (routerIds.length === 0) return [];
        
        try {
            // This is a complex query to find the latest record for each router
            // In partitioned tables, this is most efficient with a lateral join or a distinct on
            const result = await tx.execute(sql`
                SELECT DISTINCT ON (router_id) *
                FROM ${routerMetrics}
                WHERE router_id IN (${sql.join(routerIds.map(id => sql`${id}`), sql`, `)})
                ORDER BY router_id, recorded_at DESC
            `);
            return result.rows || result;
        } catch (err) {
            logger.error({ routerIds, err }, 'Failed to fetch latest metrics for routers');
            return [];
        }
    }

    /**
     * Get router metrics history with partition-friendly filtering
     */
    async getRouterHistory(
        routerId: string, 
        params: { 
            limit?: number; 
            startDate?: Date; 
            endDate?: Date;
        }, 
        tx: any = db
    ): Promise<RouterMetric[]> {
        const filters = [eq(routerMetrics.routerId, routerId)];
        
        if (params.startDate) filters.push(gte(routerMetrics.recordedAt, params.startDate));
        if (params.endDate) filters.push(lte(routerMetrics.recordedAt, params.endDate));

        return tx
            .select()
            .from(routerMetrics)
            .where(and(...filters))
            .orderBy(desc(routerMetrics.recordedAt))
            .limit(params.limit || 100);
    }

    /**
     * Batch insert router metrics
     */
    async insertRouterMetrics(data: NewRouterMetric[], tx: any = db): Promise<void> {
        if (data.length === 0) return;
        await tx.insert(routerMetrics).values(data);
    }

    /**
     * Batch insert interface metrics
     */
    async insertInterfaceMetrics(data: any[], tx: any = db): Promise<void> {
        if (data.length === 0) return;
        await tx.insert(routerInterfaceMetrics).values(data);
    }

    /**
     * Get interface metrics history with partition-friendly filtering
     */
    async getInterfaceHistory(
        interfaceId: string,
        params: {
            limit?: number;
            startDate?: Date;
            endDate?: Date;
        },
        tx: any = db
    ): Promise<any[]> {
        const filters = [eq(routerInterfaceMetrics.interfaceId, interfaceId)];
        
        if (params.startDate) filters.push(gte(routerInterfaceMetrics.recordedAt, params.startDate));
        if (params.endDate) filters.push(lte(routerInterfaceMetrics.recordedAt, params.endDate));

        return tx
            .select()
            .from(routerInterfaceMetrics)
            .where(and(...filters))
            .orderBy(desc(routerInterfaceMetrics.recordedAt))
            .limit(params.limit || 100);
    }

    /**
     * Find latest metrics for multiple interfaces (for rate calculation)
     */
    async findLatestForInterfaces(interfaceIds: string[], tx: any = db): Promise<any[]> {
        if (interfaceIds.length === 0) return [];
        
        try {
            const result = await tx.execute(sql`
                SELECT DISTINCT ON (interface_id) interface_id, recorded_at
                FROM ${routerInterfaceMetrics}
                WHERE interface_id IN (${sql.join(interfaceIds.map(id => sql`${id}`), sql`, `)})
                ORDER BY interface_id, recorded_at DESC
            `);
            return result.rows || result;
        } catch (err) {
            logger.error({ interfaceIds, err }, 'Failed to fetch latest metrics for interfaces');
            return [];
        }
    }

    /**
     * Delete old metrics (useful for manual cleanup, though partitioning handles this better)
     */
    async deleteOlderThan(date: Date, tx: any = db): Promise<number> {
        const result = await tx.delete(routerMetrics).where(lte(routerMetrics.recordedAt, date)).returning();
        return result.length;
    }
}

export const metricRepository = MetricRepository.getInstance();
