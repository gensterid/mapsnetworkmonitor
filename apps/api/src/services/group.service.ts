import { eq } from 'drizzle-orm';
import { db } from '../db';
import { routerGroups, type RouterGroup, type NewRouterGroup } from '../db/schema';

/**
 * Group Service - handles router group operations
 */
export class GroupService {
    /**
     * Get all groups
     */
    async findAll(): Promise<RouterGroup[]> {
        return db.select().from(routerGroups);
    }

    /**
     * Get group by ID
     */
    async findById(id: string): Promise<RouterGroup | undefined> {
        const [group] = await db
            .select()
            .from(routerGroups)
            .where(eq(routerGroups.id, id));
        return group;
    }

    /**
     * Create a new group
     */
    async create(data: NewRouterGroup): Promise<RouterGroup> {
        const [group] = await db.insert(routerGroups).values(data).returning();
        return group;
    }

    /**
     * Update group
     */
    async update(
        id: string,
        data: Partial<Omit<NewRouterGroup, 'id'>>
    ): Promise<RouterGroup | undefined> {
        const [group] = await db
            .update(routerGroups)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(routerGroups.id, id))
            .returning();
        return group;
    }

    /**
     * Delete group
     */
    async delete(id: string): Promise<boolean> {
        const result = await db
            .delete(routerGroups)
            .where(eq(routerGroups.id, id))
            .returning();
        return result.length > 0;
    }
}

// Export singleton instance
export const groupService = new GroupService();
