/**
 * MikHMON Console routes — Phase A1 skeleton.
 *
 * Endpoint layout (all router-scoped):
 *   GET  /api/mikhmon/:routerId/info       — router meta + current hotspot_mode
 *   GET  /api/mikhmon/:routerId/resource   — live system/resource snapshot
 *
 * Phase A2+ will add hotspot/queue/ip/system sub-routers on the same mount.
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { resolveRouterContext } from '../services/mikhmon/mikhmon-router-context.js';
import { getRouterResources } from '../lib/mikrotik/system.js';
import { cacheService } from '../lib/cache.js';

const router = Router();

// All MikHMON endpoints require an operator-level session
router.use(authMiddleware);
router.use(requireOperator);

/**
 * GET /api/mikhmon/:routerId/info
 * Returns router meta + hotspot_mode for shell badge.
 * Lightweight — no MikroTik connection needed.
 */
router.get(
    '/:routerId/info',
    resolveRouterContext({ connect: false }),
    asyncHandler(async (req, res) => {
        res.json({
            data: {
                router: req.mtRouter,
                hotspotMode: req.routerHotspotMode,
            },
        });
    })
);

/**
 * GET /api/mikhmon/:routerId/resource
 * Live system/resource snapshot for the top-bar widget.
 * Cached briefly (MIKHMON_LIVE_TTL) to absorb burst polling from
 * multiple operators viewing the same router simultaneously.
 */
router.get(
    '/:routerId/resource',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const cacheKey = `mikhmon:${req.params.routerId}:resource`;
        const cached = await cacheService.get<any>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }

        const resource = await getRouterResources(req.mtConn);
        await cacheService.set(cacheKey, resource, cacheService.TTL.MIKHMON_LIVE);
        res.set('X-Cache', 'MISS');
        res.json({ data: resource });
    })
);

export default router;
