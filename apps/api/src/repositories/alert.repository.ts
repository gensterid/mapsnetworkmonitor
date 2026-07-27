import { eq, and, desc, asc, inArray, gte, lte, or, sql, getTableColumns, type SQL, ilike } from 'drizzle-orm';
import { db } from '../db/index.js';
import { alerts, users, routers, type Alert, type NewAlert } from '../db/schema/index.js';

/**
 * Alert Repository - handles incident and status change history
 * Centralizes complex alerting queries and status updates.
 */
export class AlertRepository {
    private static instance: AlertRepository;

    private constructor() {}

    public static getInstance(): AlertRepository {
        if (!AlertRepository.instance) {
            AlertRepository.instance = new AlertRepository();
        }
        return AlertRepository.instance;
    }

    /**
     * Find all alerts with advanced filtering and pagination
     */
    async findAll(params: {
        page?: number;
        limit?: number;
        sortOrder?: 'asc' | 'desc';
        startDate?: Date;
        endDate?: Date;
        userId?: string;
        userRole?: string;
        search?: string;
        routerId?: string;
        resolved?: boolean;
        acknowledged?: boolean;
        tenantId?: string;
        type?: string | string[];
        categoryFilters?: SQL[];
    }, tx: any = db): Promise<{ data: any[]; total: number }> {
        const page = params.page || 1;
        const limit = params.limit || 100;
        const offset = (page - 1) * limit;
        
        const filters: SQL[] = [];
        if (params.tenantId) filters.push(eq(alerts.tenantId, params.tenantId));
        if (params.resolved !== undefined) filters.push(eq(alerts.resolved, params.resolved));
        if (params.acknowledged !== undefined) filters.push(eq(alerts.acknowledged, params.acknowledged));
        if (params.startDate) filters.push(gte(alerts.createdAt, params.startDate));
        if (params.endDate) filters.push(lte(alerts.createdAt, params.endDate));
        if (params.routerId) filters.push(eq(alerts.routerId, params.routerId));
        
        if (params.type) {
            if (Array.isArray(params.type)) {
                filters.push(inArray(alerts.type, params.type as any));
            } else {
                filters.push(eq(alerts.type, params.type as any));
            }
        }

        if (params.categoryFilters) {
            filters.push(...params.categoryFilters);
        }

        if (params.search) {
            const searchTerm = `%${params.search}%`;
            filters.push(or(
                ilike(alerts.title, searchTerm),
                ilike(alerts.message, searchTerm),
                ilike(routers.name, searchTerm)
            ) as SQL);
        }

        const baseQuery = tx
            .select({
                ...getTableColumns(alerts),
                acknowledgedByName: users.name,
                routerName: routers.name,
            })
            .from(alerts)
            .leftJoin(users, eq(alerts.acknowledgedBy, users.id))
            .leftJoin(routers, eq(alerts.routerId, routers.id))
            .where(filters.length > 0 ? and(...filters) : undefined);

        const data = await baseQuery
            .orderBy(params.sortOrder === 'asc' ? asc(alerts.createdAt) : desc(alerts.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(alerts)
            .leftJoin(users, eq(alerts.acknowledgedBy, users.id))
            .leftJoin(routers, eq(alerts.routerId, routers.id))
            .where(filters.length > 0 ? and(...filters) : undefined);

        return { data, total: Number(count) };
    }

    /**
     * Find alert by ID with optional tenant filtering
     */
    async findById(id: string, options: { tenantId?: string } = {}, tx: any = db): Promise<Alert | undefined> {
        const filters = [eq(alerts.id, id)];
        if (options.tenantId) filters.push(eq(alerts.tenantId, options.tenantId));

        const [alert] = await tx.select().from(alerts).where(and(...filters));
        return alert;
    }

    /**
     * Find latest unresolved alerts across all routers
     */
    async findLatestUnresolved(params: {
        tenantId?: string;
        limit?: number;
    }, tx: any = db): Promise<Alert[]> {
        const filters = [eq(alerts.resolved, false)];
        if (params.tenantId) filters.push(eq(alerts.tenantId, params.tenantId));

        return tx
            .select()
            .from(alerts)
            .where(and(...filters))
            .orderBy(desc(alerts.createdAt))
            .limit(params.limit || 50);
    }

    /**
     * Find recent alerts for a specific router and type (Deduplication)
     */
    async findRecentForRouter(
        routerId: string,
        type: string,
        since: Date,
        tx: any = db
    ): Promise<Alert[]> {
        return tx
            .select()
            .from(alerts)
            .where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, type as any),
                gte(alerts.createdAt, since)
            ));
    }

    /**
     * Create a new alert
     */
    async create(data: NewAlert, tx: any = db): Promise<Alert> {
        const [inserted] = await tx.insert(alerts).values(data).returning();
        return inserted;
    }

    /**
     * Resolve single alert
     */
    async resolve(id: string, tenantId?: string, tx: any = db): Promise<Alert | undefined> {
        const [updated] = await tx
            .update(alerts)
            .set({ 
                resolved: true, 
                resolvedAt: new Date(),
                updatedAt: new Date()
            })
            .where(and(eq(alerts.id, id), tenantId ? eq(alerts.tenantId, tenantId) : undefined))
            .returning();
        return updated;
    }

    /**
     * Batch resolve alerts by IDs
     */
    async resolveBatch(ids: string[], tx: any = db): Promise<number> {
        if (ids.length === 0) return 0;
        const result = await tx
            .update(alerts)
            .set({ 
                resolved: true, 
                resolvedAt: new Date(),
                updatedAt: new Date()
            })
            .where(inArray(alerts.id, ids))
            .returning();
        return result.length;
    }

    /**
     * Count unresolved alerts by severity
     */
    async countBySeverity(tenantId: string, tx: any = db): Promise<Record<string, number>> {
        const result = await tx
            .select({ 
                severity: alerts.severity,
                count: sql<number>`count(*)`
            })
            .from(alerts)
            .where(and(
                eq(alerts.tenantId, tenantId),
                eq(alerts.resolved, false)
            ))
            .groupBy(alerts.severity);

        const counts: Record<string, number> = { critical: 0, warning: 0, info: 0 };
        result.forEach((r: any) => {
            if (r.severity) counts[r.severity] = Number(r.count);
        });
        return counts;
    }
    /**
     * Count unacknowledged alerts for a specific scope
     */
    async countUnacknowledged(params: {
        tenantId?: string;
        routerIds?: string[];
    }, tx: any = db): Promise<number> {
        const filters = [eq(alerts.acknowledged, false)];
        if (params.tenantId) filters.push(eq(alerts.tenantId, params.tenantId));
        if (params.routerIds) filters.push(inArray(alerts.routerId, params.routerIds));

        const [result] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(alerts)
            .where(and(...filters));
            
        return Number(result?.count || 0);
    }
    /**
     * Acknowledge an alert
     */
    async acknowledge(id: string, userId: string, tenantId?: string, tx: any = db): Promise<Alert | undefined> {
        const [updated] = await tx
            .update(alerts)
            .set({
                acknowledged: true,
                acknowledgedBy: userId,
                acknowledgedAt: new Date(),
                updatedAt: new Date()
            })
            .where(and(eq(alerts.id, id), tenantId ? eq(alerts.tenantId, tenantId) : undefined))
            .returning();
        return updated;
    }

    /**
     * Delete an alert
     */
    async delete(id: string, options: { tenantId?: string } = {}, tx: any = db): Promise<boolean> {
        const filters = [eq(alerts.id, id)];
        if (options.tenantId) filters.push(eq(alerts.tenantId, options.tenantId));

        const result = await tx.delete(alerts).where(and(...filters)).returning();
        return result.length > 0;
    }
}

export const alertRepository = AlertRepository.getInstance();
