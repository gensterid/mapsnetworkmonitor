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
    listIpBindings,
    addIpBinding,
    setIpBinding,
    removeIpBinding,
    listWalledGarden,
    addWalledGarden,
    setWalledGarden,
    removeWalledGarden,
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

// ─────────────────────────────────────────────────────────────────────────
// IP Binding CRUD (Phase A3)
// ─────────────────────────────────────────────────────────────────────────

const ipBindingTypeSchema = z.enum(['regular', 'bypassed', 'blocked']);
const ipBindingInputSchema = z.object({
    macAddress: z.string().optional(),
    address: z.string().optional(),
    toAddress: z.string().optional(),
    server: z.string().optional(),
    type: ipBindingTypeSchema,
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
});
const ipBindingPatchSchema = ipBindingInputSchema.partial();

const ipBindingCacheKey = (routerId: string) => `mikhmon:${routerId}:hotspot:ip-bindings`;
const invalidateIpBindingCache = (routerId: string) =>
    cacheService.delete(ipBindingCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] ip-binding cache invalidate failed'),
    );

router.get(
    '/:routerId/hotspot/ip-bindings',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = ipBindingCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listIpBindings(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/hotspot/ip-bindings',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = ipBindingInputSchema.parse(req.body);
        const id = await addIpBinding(req.mtConn, input);
        await invalidateIpBindingCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/hotspot/ip-bindings/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'binding id wajib');
        const input = ipBindingPatchSchema.parse(req.body);
        await setIpBinding(req.mtConn, id, input);
        await invalidateIpBindingCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/hotspot/ip-bindings/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'binding id wajib');
        await removeIpBinding(req.mtConn, id);
        await invalidateIpBindingCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// Walled Garden CRUD (Phase A3)
// ─────────────────────────────────────────────────────────────────────────

const walledGardenInputSchema = z.object({
    dstHost: z.string().optional(),
    serverName: z.string().optional(),
    path: z.string().optional(),
    method: z.string().optional(),
    action: z.enum(['allow', 'deny']).optional(),
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
}).refine(
    (v) => !!(v.dstHost || v.serverName || v.path),
    { message: 'Minimal isi dst-host, server, atau path' },
);
const walledGardenPatchSchema = z.object({
    dstHost: z.string().optional(),
    serverName: z.string().optional(),
    path: z.string().optional(),
    method: z.string().optional(),
    action: z.enum(['allow', 'deny']).optional(),
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
});

const walledGardenCacheKey = (routerId: string) => `mikhmon:${routerId}:hotspot:walled-garden`;
const invalidateWalledGardenCache = (routerId: string) =>
    cacheService.delete(walledGardenCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] walled-garden cache invalidate failed'),
    );

router.get(
    '/:routerId/hotspot/walled-garden',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = walledGardenCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listWalledGarden(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/hotspot/walled-garden',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = walledGardenInputSchema.parse(req.body);
        const id = await addWalledGarden(req.mtConn, input);
        await invalidateWalledGardenCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/hotspot/walled-garden/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'walled-garden id wajib');
        const input = walledGardenPatchSchema.parse(req.body);
        await setWalledGarden(req.mtConn, id, input);
        await invalidateWalledGardenCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/hotspot/walled-garden/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'walled-garden id wajib');
        await removeWalledGarden(req.mtConn, id);
        await invalidateWalledGardenCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

export default router;
