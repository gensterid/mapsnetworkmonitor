/**
 * MikHMON router context middleware.
 *
 * Resolves the :routerId path parameter into a verified router + an open
 * RouterOS connection + the router's hotspot_mode setting. Every MikHMON
 * route handler can rely on req.mtConn being a live connection and
 * req.routerHotspotMode reflecting the current authoritative mode.
 *
 * Connection is taken from the existing routerActionService pool — no
 * new pool, no new credentials path.
 */
import type { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers } from '../../db/schema/routers.js';
import { billingRouterSettings } from '../../db/schema/billing.js';
import { routerActionService } from '../router-action.service.js';
import { getEffectiveTenantId } from '../../lib/tenant-utils.js';
import { ApiError } from '../../middleware/error.middleware.js';
import { logger } from '../../lib/logger.js';

export type HotspotMode = 'disabled' | 'native' | 'mikhmon_bridge';

declare module 'express-serve-static-core' {
    interface Request {
        mtConn?: any;
        mtRouter?: { id: string; name: string; host: string; tenantId: string | null };
        routerHotspotMode?: HotspotMode;
    }
}

/**
 * Validate that routerId belongs to the caller's tenant. Returns the router row.
 * Throws ApiError(404) if not found, ApiError(403) if cross-tenant access.
 */
async function resolveRouter(routerId: string, tenantId: string) {
    const [router] = await db
        .select({
            id: routers.id,
            name: routers.name,
            host: routers.host,
            tenantId: routers.tenantId,
        })
        .from(routers)
        .where(and(eq(routers.id, routerId), eq(routers.tenantId, tenantId)))
        .limit(1);

    if (!router) {
        throw new ApiError(404, 'Router tidak ditemukan atau bukan milik tenant Anda');
    }
    return router;
}

/**
 * Read hotspot_mode from billing_router_settings. Default 'disabled' if
 * the row hasn't been created yet (settings auto-create on first edit
 * in Billing UI).
 */
async function readHotspotMode(routerId: string): Promise<HotspotMode> {
    const [row] = await db
        .select({ hotspotMode: billingRouterSettings.hotspotMode })
        .from(billingRouterSettings)
        .where(eq(billingRouterSettings.routerId, routerId))
        .limit(1);
    return (row?.hotspotMode as HotspotMode) || 'disabled';
}

/**
 * Express middleware factory. Use as:
 *   router.use('/:routerId', resolveRouterContext({ connect: true }));
 *
 * - When `connect=false`, only the router row + mode are attached. Useful for
 *   metadata-only endpoints (e.g., GET mode badge info) where opening a
 *   MikroTik connection is wasteful.
 * - When `connect=true` (default), an open RouterOS connection is attached
 *   as req.mtConn. The pool is reused across requests.
 */
export function resolveRouterContext(opts: { connect?: boolean } = {}) {
    const { connect = true } = opts;
    return async (req: Request, _res: Response, next: NextFunction) => {
        const rawRouterId = req.params.routerId;
        const routerId = Array.isArray(rawRouterId) ? rawRouterId[0] : rawRouterId;
        try {
            if (!routerId) {
                throw new ApiError(400, 'routerId path param wajib');
            }
            const tenantId = getEffectiveTenantId(req);
            if (!tenantId) {
                throw new ApiError(401, 'Tenant tidak terdeteksi');
            }

            const router = await resolveRouter(routerId, tenantId);
            const mode = await readHotspotMode(routerId);

            req.mtRouter = router;
            req.routerHotspotMode = mode;

            if (connect) {
                req.mtConn = await routerActionService.getRouterConnection(routerId, tenantId);
            }

            next();
        } catch (err: any) {
            if (err instanceof ApiError) return next(err);
            logger.error({ err: err?.message, routerId }, '[MikHMON] resolveRouterContext failed');
            next(new ApiError(503, `Tidak bisa konek ke router: ${err?.message || 'unknown error'}`));
        }
    };
}
