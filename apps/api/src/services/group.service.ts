import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routerGroups, type RouterGroup, type NewRouterGroup } from '../db/schema/index.js';

/**
 * Group Service - handles router group operations
 */
export class GroupService {
    /**
     * Get all groups
     */
    async findAll(tenantId?: string): Promise<RouterGroup[]> {
        const filters = [];
        if (tenantId) {
            filters.push(eq(routerGroups.tenantId, tenantId));
        }
        return db.select().from(routerGroups).where(filters.length > 0 ? and(...filters) : undefined);
    }

    /**
     * Get group by ID
     */
    async findById(id: string, tenantId?: string): Promise<RouterGroup | undefined> {
        const filters = [eq(routerGroups.id, id)];
        if (tenantId) {
            filters.push(eq(routerGroups.tenantId, tenantId));
        }
        const [group] = await db
            .select()
            .from(routerGroups)
            .where(and(...filters));
        return group;
    }

    /**
     * Create a new group
     */
    async create(data: NewRouterGroup, tenantId: string): Promise<RouterGroup> {
        const [group] = await db.insert(routerGroups).values({ ...data, tenantId }).returning();
        return group;
    }

    /**
     * Update group
     */
    async update(
        id: string,
        data: Partial<Omit<NewRouterGroup, 'id'>>,
        tenantId?: string
    ): Promise<RouterGroup | undefined> {
        const filters = [eq(routerGroups.id, id)];
        if (tenantId) {
            filters.push(eq(routerGroups.tenantId, tenantId));
        }

        const [group] = await db
            .update(routerGroups)
            .set({ ...data, updatedAt: new Date() })
            .where(and(...filters))
            .returning();
        return group;
    }

    /**
     * Delete group
     */
    async delete(id: string, tenantId?: string): Promise<boolean> {
        const filters = [eq(routerGroups.id, id)];
        if (tenantId) {
            filters.push(eq(routerGroups.tenantId, tenantId));
        }
        const result = await db
            .delete(routerGroups)
            .where(and(...filters))
            .returning();
        return result.length > 0;
    }
}

// Export singleton instance
export const groupService = new GroupService();
