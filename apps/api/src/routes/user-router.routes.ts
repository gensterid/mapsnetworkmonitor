import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userRouters, routers, users } from '../db/schema/index.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

// Schema for assigning routers
const assignRoutersSchema = z.object({
    routerIds: z.array(z.string().uuid()),
});

/**
 * GET /api/users/:userId/routers
 * Get routers assigned to a user
 */
router.get(
    '/:userId/routers',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;

        // Verify user exists
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const assigned = await db
            .select({
                router: routers,
            })
            .from(userRouters)
            .innerJoin(routers, eq(userRouters.routerId, routers.id))
            .where(eq(userRouters.userId, userId));

        res.json({ data: assigned.map((a) => a.router) });
    })
);

/**
 * POST /api/users/:userId/routers
 * Assign routers to a user (replaces existing assignments)
 */
router.post(
    '/:userId/routers',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { routerIds } = assignRoutersSchema.parse(req.body);

        // Verify user exists
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Transaction to replace assignments
        await db.transaction(async (tx) => {
            // Delete existing assignments
            await tx.delete(userRouters).where(eq(userRouters.userId, userId));

            // Insert new assignments
            if (routerIds.length > 0) {
                await tx.insert(userRouters).values(
                    routerIds.map((routerId) => ({
                        userId,
                        routerId,
                    }))
                );
            }
        });

        res.json({
            data: {
                success: true,
                message: 'Routers assigned successfully',
            },
        });
    })
);

export default router;
