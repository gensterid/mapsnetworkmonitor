/**
 * MikHMON Console routes.
 *
 * Endpoint layout (all router-scoped):
 *   GET    /api/mikhmon/:routerId/info                    — router meta + hotspot_mode
 *   GET    /api/mikhmon/:routerId/resource                — live system/resource
 *   GET    /api/mikhmon/:routerId/hotspot/profiles        — list user profiles
 *   POST   /api/mikhmon/:routerId/hotspot/profiles        — add user profile
 *   PATCH  /api/mikhmon/:routerId/hotspot/profiles/:id    — set user profile
 *   DELETE /api/mikhmon/:routerId/hotspot/profiles/:id    — remove user profile
 *
 * Phase A3+ adds the rest of /hotspot/*, /ppp/*, /queues, /ip/*, /system/*.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { resolveRouterContext } from '../services/mikhmon/mikhmon-router-context.js';
import { getRouterResources } from '../lib/mikrotik/system.js';
import {
    listHotspotUserProfiles,
    addHotspotUserProfile,
    setHotspotUserProfile,
    removeHotspotUserProfile,
} from '../lib/mikrotik/hotspot-advanced.js';
import { cacheService } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

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

// ─────────────────────────────────────────────────────────────────────────
// Hotspot User Profile CRUD (Phase A2)
// ─────────────────────────────────────────────────────────────────────────

const profileInputSchema = z.object({
    name: z.string().min(1, 'name wajib'),
    sharedUsers: z.string().optional(),
    rateLimit: z.string().optional(),
    sessionTimeout: z.string().optional(),
    idleTimeout: z.string().optional(),
    keepaliveTimeout: z.string().optional(),
    statusAutorefresh: z.string().optional(),
    onLogin: z.string().optional(),
    onLogout: z.string().optional(),
    addressList: z.string().optional(),
    macCookieTimeout: z.string().optional(),
    addressPool: z.string().optional(),
    parentQueue: z.string().optional(),
    transparentProxy: z.boolean().optional(),
    incomingFilter: z.string().optional(),
    outgoingFilter: z.string().optional(),
    incomingPacketMark: z.string().optional(),
    outgoingPacketMark: z.string().optional(),
    openStatusPage: z.string().optional(),
    addMacCookie: z.boolean().optional(),
});

const profilePatchSchema = profileInputSchema.partial();

const profileCacheKey = (routerId: string) => `mikhmon:${routerId}:hotspot:profiles`;
const invalidateProfileCache = (routerId: string) =>
    cacheService.delete(profileCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] profile cache invalidate failed'),
    );

const paramStr = (v: string | string[] | undefined): string => Array.isArray(v) ? v[0] || '' : (v || '');

router.get(
    '/:routerId/hotspot/profiles',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = profileCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const profiles = await listHotspotUserProfiles(req.mtConn);
        await cacheService.set(cacheKey, profiles, cacheService.TTL.MIKHMON_STATIC);
        res.set('X-Cache', 'MISS');
        res.json({ data: profiles });
    })
);

router.post(
    '/:routerId/hotspot/profiles',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = profileInputSchema.parse(req.body);
        const id = await addHotspotUserProfile(req.mtConn, input);
        await invalidateProfileCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/hotspot/profiles/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'profile id wajib');
        const input = profilePatchSchema.parse(req.body);
        await setHotspotUserProfile(req.mtConn, id, input);
        await invalidateProfileCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/hotspot/profiles/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'profile id wajib');
        await removeHotspotUserProfile(req.mtConn, id);
        await invalidateProfileCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

export default router;
