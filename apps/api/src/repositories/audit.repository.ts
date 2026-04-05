import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { auditLogs, type AuditLog, type NewAuditLog } from '../db/schema/index.js';

/**
 * Audit Repository - handles logging and tracking for system-wide auditing
 * Centralizes database access for change tracking and security compliance.
 */
export class AuditRepository {
    private static instance: AuditRepository;

    private constructor() {}

    public static getInstance(): AuditRepository {
        if (!AuditRepository.instance) {
            AuditRepository.instance = new AuditRepository();
        }
        return AuditRepository.instance;
    }

    /**
     * Create a new audit log entry
     */
    async create(data: NewAuditLog, tx: any = db): Promise<AuditLog> {
        const [inserted] = await tx.insert(auditLogs).values(data).returning();
        return inserted;
    }

    /**
     * Find audit logs with optional filtering
     */
    async findAll(params: {
        tenantId?: string;
        userId?: string;
        entity?: string;
        entityId?: string;
        limit?: number;
        startDate?: Date;
        endDate?: Date;
    }, tx: any = db): Promise<AuditLog[]> {
        const filters = [];

        if (params.tenantId) filters.push(eq(auditLogs.tenantId, params.tenantId));
        if (params.userId) filters.push(eq(auditLogs.userId, params.userId));
        if (params.entity) filters.push(eq(auditLogs.entity, params.entity));
        if (params.entityId) filters.push(eq(auditLogs.entityId, params.entityId));
        
        if (params.startDate) filters.push(gte(auditLogs.createdAt, params.startDate));
        if (params.endDate) filters.push(lte(auditLogs.createdAt, params.endDate));

        return tx
            .select()
            .from(auditLogs)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(desc(auditLogs.createdAt))
            .limit(params.limit || 100);
    }

    /**
     * Delete old logs (Retention policy)
     */
    async deleteOlderThan(days: number, tenantId?: string, tx: any = db): Promise<number> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const filters = [lte(auditLogs.createdAt, cutoff)];
        if (tenantId) filters.push(eq(auditLogs.tenantId, tenantId));

        const result = await tx
            .delete(auditLogs)
            .where(and(...filters))
            .returning({ id: auditLogs.id });
            
        return result.length;
    }

    /**
     * Count logs for a specific entity or user
     */
    async count(params: {
        tenantId?: string;
        userId?: string;
        action?: string;
    }, tx: any = db): Promise<number> {
        const filters = [];
        if (params.tenantId) filters.push(eq(auditLogs.tenantId, params.tenantId));
        if (params.userId) filters.push(eq(auditLogs.userId, params.userId));
        if (params.action) filters.push(eq(auditLogs.action, params.action));

        const [result] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(auditLogs)
            .where(filters.length > 0 ? and(...filters) : undefined);
            
        return Number(result?.count || 0);
    }
}

export const auditRepository = AuditRepository.getInstance();
