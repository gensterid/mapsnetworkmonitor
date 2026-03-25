import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routerInterfaces, type RouterInterface, type NewRouterInterface } from '../db/schema/index.js';

/**
 * Interface Repository - handles CRUD operations for router interfaces
 * Centralizes database access to avoid N+1 queries and duplicate logic.
 */
export class InterfaceRepository {
    private static instance: InterfaceRepository;

    private constructor() {}

    public static getInstance(): InterfaceRepository {
        if (!InterfaceRepository.instance) {
            InterfaceRepository.instance = new InterfaceRepository();
        }
        return InterfaceRepository.instance;
    }

    /**
     * Find all interfaces for a specific router
     */
    async findByRouterId(routerId: string, tx: any = db): Promise<RouterInterface[]> {
        return tx
            .select()
            .from(routerInterfaces)
            .where(eq(routerInterfaces.routerId, routerId));
    }

    /**
     * Find interfaces for multiple routers in one batch
     */
    async findByRouterIds(routerIds: string[], tx: any = db): Promise<RouterInterface[]> {
        if (routerIds.length === 0) return [];
        return tx
            .select()
            .from(routerInterfaces)
            .where(inArray(routerInterfaces.routerId, routerIds));
    }

    /**
     * Batch UPSERT interfaces (Create or Update based on router_id + name)
     */
    async batchUpsert(data: (NewRouterInterface & { lastUpdated?: Date })[], tx: any = db): Promise<void> {
        if (data.length === 0) return;

        await tx.insert(routerInterfaces)
            .values(data)
            .onConflictDoUpdate({
                target: [routerInterfaces.routerId, routerInterfaces.name],
                set: {
                    defaultName: sql`EXCLUDED.default_name`,
                    type: sql`EXCLUDED.type`,
                    macAddress: sql`EXCLUDED.mac_address`,
                    running: sql`EXCLUDED.running`,
                    disabled: sql`EXCLUDED.disabled`,
                    comment: sql`EXCLUDED.comment`,
                    lastUpdated: new Date()
                }
            });
    }

    /**
     * Delete interfaces for a router
     */
    async deleteByRouterId(routerId: string, tx: any = db): Promise<void> {
        await tx.delete(routerInterfaces).where(eq(routerInterfaces.routerId, routerId));
    }
}

export const interfaceRepository = InterfaceRepository.getInstance();
