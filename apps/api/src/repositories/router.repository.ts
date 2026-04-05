import { eq, and, inArray, desc, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers, userRouters, type Router, type NewRouter } from '../db/schema/index.js';

/**
 * Router Repository - handles CRUD operations for routers
 * Centralizes database access and RBAC filtering logic.
 */
export class RouterRepository {
    private static instance: RouterRepository;

    private constructor() {}

    public static getInstance(): RouterRepository {
        if (!RouterRepository.instance) {
            RouterRepository.instance = new RouterRepository();
        }
        return RouterRepository.instance;
    }

    /**
     * Find all routers with optional tenant and RBAC filtering
     */
    async findAll(params: {
        tenantId?: string | string[];
        userId?: string;
        userRole?: string;
    }, tx: any = db): Promise<Router[]> {
        const filters = [];

        // Tenant filtering
        if (params.tenantId) {
            if (Array.isArray(params.tenantId)) {
                filters.push(inArray(routers.tenantId, params.tenantId));
            } else {
                filters.push(eq(routers.tenantId, params.tenantId));
            }
        }

        // RBAC filtering
        if (params.userId && params.userRole && params.userRole !== 'admin' && params.userRole !== 'superadmin') {
            const assigned = await tx
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, params.userId));

            const routerIds = assigned.map((a: any) => a.routerId);
            if (routerIds.length === 0) return [];
            filters.push(inArray(routers.id, routerIds));
        }

        return tx
            .select()
            .from(routers)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(routers.name);
    }

    /**
     * Find router by ID with optional tenant and RBAC filtering
     */
    async findById(id: string, params?: {
        tenantId?: string;
        userId?: string;
        userRole?: string;
    }, tx: any = db): Promise<Router | undefined> {
        const filters = [eq(routers.id, id)];

        if (params?.tenantId) {
            filters.push(eq(routers.tenantId, params.tenantId));
        }

        if (params?.userId && params?.userRole && params?.userRole !== 'admin' && params?.userRole !== 'superadmin') {
            const [assignment] = await tx
                .select()
                .from(userRouters)
                .where(and(eq(userRouters.userId, params.userId), eq(userRouters.routerId, id)));
            if (!assignment) return undefined;
        }

        const [router] = await tx
            .select()
            .from(routers)
            .where(and(...filters));
            
        return router;
    }

    /**
     * Create a new router
     */
    async create(data: NewRouter, tx: any = db): Promise<Router> {
        const [inserted] = await tx.insert(routers).values(data).returning();
        return inserted;
    }

    /**
     * Update an existing router
     */
    async update(id: string, data: Partial<NewRouter>, tx: any = db): Promise<Router | undefined> {
        const [updated] = await tx
            .update(routers)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(routers.id, id))
            .returning();
        return updated;
    }

    /**
     * Delete a router
     */
    async delete(id: string, tx: any = db): Promise<boolean> {
        const result = await tx.delete(routers).where(eq(routers.id, id)).returning();
        return result.length > 0;
    }

    /**
     * Count routers for a tenant
     */
    async countByTenant(tenantId: string, tx: any = db): Promise<number> {
        const [result] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(routers)
            .where(eq(routers.tenantId, tenantId));
        return Number(result?.count || 0);
    }
}

export const routerRepository = RouterRepository.getInstance();
