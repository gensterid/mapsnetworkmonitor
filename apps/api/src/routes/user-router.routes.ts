import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userRouters, routers, users } from '../db/schema/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

const router = Router();

// Guard self-contained — jangan bergantung pada urutan mount di index.ts.
router.use(authMiddleware);
// Tolak non-superadmin tanpa tenantId (akun orphan) → cegah bypass scoping.
router.use((req, _res, next) => {
    const u = (req as any).user;
    if (u?.role !== 'superadmin' && !u?.tenantId) {
        return next(new ApiError(403, 'Tenant context required'));
    }
    next();
});
router.use(requireAdmin);

// Kolom router yang RAHASIA — tak boleh bocor lewat API user↔router.
const SENSITIVE_ROUTER_KEYS = [
    'passwordEncrypted', 'snmpCommunity', 'webhookSecret',
    'genieacsPasswordEncrypted', 'emailSmtpPassEncrypted',
] as const;
function stripRouterSecrets(r: Record<string, any>): Record<string, any> {
    const clean = { ...r };
    for (const k of SENSITIVE_ROUTER_KEYS) delete clean[k];
    return clean;
}

// Verifikasi user target milik tenant pemanggil (404 — jangan bocorkan
// keberadaan user tenant lain). tenantId undefined (superadmin) → lolos.
async function assertUserOwned(userId: string, tenantId?: string): Promise<void> {
    const conds = [eq(users.id, userId)];
    if (tenantId) conds.push(eq(users.tenantId, tenantId));
    const [u] = await db.select({ id: users.id }).from(users).where(and(...conds)).limit(1);
    if (!u) throw ApiError.notFound('User not found');
}

// Schema for assigning routers
const assignRoutersSchema = z.object({
    routerIds: z.array(z.string().uuid()),
});

/**
 * GET /api/users/:userId/routers
 * Get routers assigned to a user (secrets stripped, tenant-scoped)
 */
router.get(
    '/:userId/routers',
    asyncHandler(async (req, res) => {
        const userId = req.params.userId as string;
        const tenantId = getEffectiveTenantId(req);

        await assertUserOwned(userId, tenantId);

        // Batasi join ke router milik tenant pemanggil (defense-in-depth
        // seandainya ada assignment lintas-tenant yang tercecer di data).
        const conds = [eq(userRouters.userId, userId)];
        if (tenantId) conds.push(eq(routers.tenantId, tenantId));
        const assigned = await db
            .select({ router: routers })
            .from(userRouters)
            .innerJoin(routers, eq(userRouters.routerId, routers.id))
            .where(and(...conds));

        res.json({ data: assigned.map((a) => stripRouterSecrets(a.router)) });
    })
);

/**
 * POST /api/users/:userId/routers
 * Assign routers to a user (replaces existing assignments)
 */
router.post(
    '/:userId/routers',
    asyncHandler(async (req, res) => {
        const userId = req.params.userId as string;
        const tenantId = getEffectiveTenantId(req);
        const { routerIds } = assignRoutersSchema.parse(req.body);

        await assertUserOwned(userId, tenantId);

        // Verifikasi SETIAP routerId milik tenant pemanggil sebelum assign —
        // cegah menempelkan router tenant lain ke user.
        if (routerIds.length > 0) {
            const ownConds = [inArray(routers.id, routerIds)];
            if (tenantId) ownConds.push(eq(routers.tenantId, tenantId));
            const owned = await db.select({ id: routers.id }).from(routers).where(and(...ownConds));
            if (owned.length !== new Set(routerIds).size) {
                throw ApiError.notFound('One or more routers not found');
            }
        }

        // Transaction to replace assignments
        await db.transaction(async (tx) => {
            // Hapus HANYA assignment yang router-nya milik tenant pemanggil —
            // jangan menyentuh baris lintas-tenant yang mungkin tercecer dari
            // data lama (superadmin: tenantId undefined → hapus semua).
            const delConds = [eq(userRouters.userId, userId)];
            if (tenantId) {
                delConds.push(inArray(
                    userRouters.routerId,
                    tx.select({ id: routers.id }).from(routers).where(eq(routers.tenantId, tenantId))
                ));
            }
            await tx.delete(userRouters).where(and(...delConds));

            if (routerIds.length > 0) {
                await tx.insert(userRouters).values(
                    routerIds.map((routerId) => ({ userId, routerId }))
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
