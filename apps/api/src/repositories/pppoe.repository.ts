import { eq, and, inArray, desc, sql, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pppoeSessions, userRouters, type PppoeSession, type NewPppoeSession } from '../db/schema/index.js';

/**
 * PPPoE Repository - handles CRUD and batch operations for PPPoE sessions.
 * Centralizes database access and session tracking logic for scalability.
 */
export class PppoeRepository {
    private static instance: PppoeRepository;

    private constructor() {}

    public static getInstance(): PppoeRepository {
        if (!PppoeRepository.instance) {
            PppoeRepository.instance = new PppoeRepository();
        }
        return PppoeRepository.instance;
    }

    /**
     * Find all PPPoE sessions with tenant and RBAC filtering
     */
    async findAll(params: {
        routerId?: string;
        tenantId?: string;
        userId?: string;
        userRole?: string;
        status?: 'active' | 'disconnected';
        onlyWithCoordinates?: boolean;
    }, tx: any = db): Promise<PppoeSession[]> {
        const filters = [];

        if (params.routerId) filters.push(eq(pppoeSessions.routerId, params.routerId));
        if (params.tenantId) filters.push(eq(pppoeSessions.tenantId, params.tenantId));
        if (params.status) filters.push(eq(pppoeSessions.status, params.status));
        
        if (params.onlyWithCoordinates) {
            filters.push(isNotNull(pppoeSessions.latitude));
            filters.push(isNotNull(pppoeSessions.longitude));
            filters.push(sql`${pppoeSessions.latitude} != ''`);
            filters.push(sql`${pppoeSessions.longitude} != ''`);
        }

        // RBAC filtering
        if (params.userId && params.userRole && params.userRole !== 'admin' && params.userRole !== 'superadmin') {
            const assigned = await tx
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, params.userId));

            const routerIds = assigned.map((a: any) => a.routerId);
            if (routerIds.length === 0) return [];
            filters.push(inArray(pppoeSessions.routerId, routerIds));
        }

        return tx
            .select()
            .from(pppoeSessions)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(pppoeSessions.name);
    }

    /**
     * Find session by ID
     */
    async findById(id: string, tenantId?: string, tx: any = db): Promise<PppoeSession | undefined> {
        const filters = [eq(pppoeSessions.id, id)];
        if (tenantId) filters.push(eq(pppoeSessions.tenantId, tenantId));

        const [session] = await tx
            .select()
            .from(pppoeSessions)
            .where(and(...filters));
            
        return session;
    }

    /**
     * Find sessions by router ID
     */
    async findByRouter(routerId: string, tx: any = db): Promise<PppoeSession[]> {
        return tx
            .select()
            .from(pppoeSessions)
            .where(eq(pppoeSessions.routerId, routerId));
    }

    /**
     * Create a new session
     */
    async create(data: NewPppoeSession, tx: any = db): Promise<PppoeSession> {
        const [inserted] = await tx.insert(pppoeSessions).values(data).returning();
        return inserted;
    }

    /**
     * Update an existing session
     */
    async update(id: string, data: Partial<PppoeSession>, tx: any = db): Promise<PppoeSession | undefined> {
        const [updated] = await tx
            .update(pppoeSessions)
            .set(data)
            .where(eq(pppoeSessions.id, id))
            .returning();
        return updated;
    }

    /**
     * Delete a session
     */
    async delete(id: string, tx: any = db): Promise<boolean> {
        const result = await tx.delete(pppoeSessions).where(eq(pppoeSessions.id, id)).returning();
        return result.length > 0;
    }

    /**
     * Delete all sessions for a router
     */
    async deleteByRouter(routerId: string, tx: any = db): Promise<void> {
        await tx.delete(pppoeSessions).where(eq(pppoeSessions.routerId, routerId));
    }

    /**
     * Batch update traffic stats
     */
    async updateTrafficBatch(updates: {
        id: string;
        txBytes: number;
        rxBytes: number;
        txRate: number;
        rxRate: number;
        lastTrafficUpdate: Date;
    }[], tx: any = db): Promise<void> {
        if (updates.length === 0) return;

        // Using a transaction for batch updates if not already provided
        const execute = async (t: any) => {
            for (const update of updates) {
                await t.update(pppoeSessions)
                    .set({
                        txBytes: update.txBytes,
                        rxBytes: update.rxBytes,
                        txRate: update.txRate,
                        rxRate: update.rxRate,
                        lastTrafficUpdate: update.lastTrafficUpdate
                    })
                    .where(eq(pppoeSessions.id, update.id));
            }
        };

        if (tx) {
            await execute(tx);
        } else {
            await db.transaction(execute);
        }
    }
}

export const pppoeRepository = PppoeRepository.getInstance();
