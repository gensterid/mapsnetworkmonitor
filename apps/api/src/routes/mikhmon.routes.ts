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
    listHotspotActive,
    removeHotspotActive,
    listHotspotHosts,
    listHotspotCookies,
    removeHotspotCookie,
    listHotspotServerProfiles,
    addHotspotServerProfile,
    setHotspotServerProfile,
    removeHotspotServerProfile,
} from '../lib/mikrotik/hotspot-advanced.js';
import {
    getHotspotUsers,
    addHotspotUser,
    updateHotspotUser,
    deleteHotspotUser,
    getPppSecrets,
    addPppSecret,
    updatePppSecret,
    deletePppSecret,
    getPppProfiles,
    addPppProfile,
} from '../lib/mikrotik/billing.js';
import {
    setPppProfile,
    removePppProfile,
    listPppActive,
    removePppActive,
} from '../lib/mikrotik/ppp-advanced.js';
import {
    listIpPools,
    addIpPool,
    setIpPool,
    removeIpPool,
    listDhcpLeases,
    addDhcpLease,
    setDhcpLease,
    makeDhcpLeaseStatic,
    removeDhcpLease,
    listAddressList,
    addAddressList,
    setAddressList,
    removeAddressList,
} from '../lib/mikrotik/ip-management.js';
import {
    getLog,
    listSystemPackages,
    setScheduler,
} from '../lib/mikrotik/system-extra.js';
import {
    getSchedulers,
    addScheduler,
    deleteScheduler,
} from '../lib/mikrotik/billing.js';
import {
    generateMikhmonVouchers,
    listMikhmonVouchers,
    removeMikhmonVoucher,
} from '../services/mikhmon/mikhmon-voucher.service.js';
import {
    listSimpleQueues,
    addSimpleQueue,
    setSimpleQueue,
    removeSimpleQueue,
    getSimpleQueueStats,
} from '../lib/mikrotik/queue-simple.js';
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

// ─────────────────────────────────────────────────────────────────────────
// Simple Queue CRUD + stats (Phase A4)
// ─────────────────────────────────────────────────────────────────────────

const queueInputSchema = z.object({
    name: z.string().min(1, 'name wajib'),
    target: z.string().min(1, 'target wajib'),
    maxLimit: z.string().optional(),
    limitAt: z.string().optional(),
    burstLimit: z.string().optional(),
    burstThreshold: z.string().optional(),
    burstTime: z.string().optional(),
    priority: z.string().optional(),
    parent: z.string().optional(),
    queue: z.string().optional(),
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
});
const queuePatchSchema = queueInputSchema.partial();

const queueCacheKey = (routerId: string) => `mikhmon:${routerId}:queue:simple`;
const invalidateQueueCache = (routerId: string) =>
    cacheService.delete(queueCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] queue cache invalidate failed'),
    );

router.get(
    '/:routerId/queues',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = queueCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listSimpleQueues(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/queues',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = queueInputSchema.parse(req.body);
        const id = await addSimpleQueue(req.mtConn, input);
        await invalidateQueueCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/queues/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'queue id wajib');
        const input = queuePatchSchema.parse(req.body);
        await setSimpleQueue(req.mtConn, id, input);
        await invalidateQueueCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/queues/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'queue id wajib');
        await removeSimpleQueue(req.mtConn, id);
        await invalidateQueueCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

/**
 * GET /api/mikhmon/:routerId/queues/stats
 * Live per-queue traffic snapshot. Uncached — chart polls this directly
 * at the global refresh interval (auto-pauses when tab hidden).
 */
router.get(
    '/:routerId/queues/stats',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const stats = await getSimpleQueueStats(req.mtConn);
        res.json({ data: stats });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Users CRUD (Phase A5) — delegates to billing.ts helpers
// ─────────────────────────────────────────────────────────────────────────

const hotspotUserAddSchema = z.object({
    name: z.string().min(1, 'name wajib'),
    password: z.string().min(1, 'password wajib'),
    profile: z.string().optional(),
    server: z.string().optional(),
    limitUptime: z.string().optional(),
    limitBytesTotal: z.string().optional(),
    macAddress: z.string().optional(),
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
});
const hotspotUserPatchSchema = z.object({
    password: z.string().optional(),
    profile: z.string().optional(),
    limitUptime: z.string().optional(),
    limitBytesTotal: z.string().optional(),
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
});

const hotspotUserCacheKey = (routerId: string) => `mikhmon:${routerId}:hotspot:users`;
const invalidateHotspotUserCache = (routerId: string) =>
    cacheService.delete(hotspotUserCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] hotspot user cache invalidate failed'),
    );

router.get(
    '/:routerId/hotspot/users',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = hotspotUserCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await getHotspotUsers(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/hotspot/users',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = hotspotUserAddSchema.parse(req.body);
        const id = await addHotspotUser(req.mtConn, input);
        await invalidateHotspotUserCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/hotspot/users/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'user id wajib');
        const input = hotspotUserPatchSchema.parse(req.body);
        await updateHotspotUser(req.mtConn, id, input);
        await invalidateHotspotUserCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/hotspot/users/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'user id wajib');
        await deleteHotspotUser(req.mtConn, id);
        await invalidateHotspotUserCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Active sessions (Phase A5)
// Live data — uncached. Kick via DELETE :id.
// ─────────────────────────────────────────────────────────────────────────

router.get(
    '/:routerId/hotspot/active',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const items = await listHotspotActive(req.mtConn);
        res.json({ data: items });
    })
);

router.delete(
    '/:routerId/hotspot/active/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'session id wajib');
        await removeHotspotActive(req.mtConn, id);
        res.json({ data: { id, kicked: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Hosts (Phase A5) — read-only, live discovery table
// ─────────────────────────────────────────────────────────────────────────

router.get(
    '/:routerId/hotspot/hosts',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const items = await listHotspotHosts(req.mtConn);
        res.json({ data: items });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Cookies (Phase A5) — list + remove only
// ─────────────────────────────────────────────────────────────────────────

const cookieCacheKey = (routerId: string) => `mikhmon:${routerId}:hotspot:cookies`;
const invalidateCookieCache = (routerId: string) =>
    cacheService.delete(cookieCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] cookie cache invalidate failed'),
    );

router.get(
    '/:routerId/hotspot/cookies',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = cookieCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listHotspotCookies(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.delete(
    '/:routerId/hotspot/cookies/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'cookie id wajib');
        await removeHotspotCookie(req.mtConn, id);
        await invalidateCookieCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Server Profile CRUD (Phase A6)
// ─────────────────────────────────────────────────────────────────────────

const serverProfileInputSchema = z.object({
    name: z.string().min(1, 'name wajib'),
    hotspotAddress: z.string().optional(),
    dnsName: z.string().optional(),
    htmlDirectory: z.string().optional(),
    rateLimit: z.string().optional(),
    httpProxy: z.string().optional(),
    smtpServer: z.string().optional(),
    loginBy: z.string().optional(),
    macAuthMode: z.string().optional(),
    useRadius: z.boolean().optional(),
    splitUserDomain: z.boolean().optional(),
});
const serverProfilePatchSchema = serverProfileInputSchema.partial();

const serverProfileCacheKey = (routerId: string) => `mikhmon:${routerId}:hotspot:server-profiles`;
const invalidateServerProfileCache = (routerId: string) =>
    cacheService.delete(serverProfileCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] server-profile cache invalidate failed'),
    );

router.get(
    '/:routerId/hotspot/server-profiles',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = serverProfileCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listHotspotServerProfiles(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_STATIC);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/hotspot/server-profiles',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = serverProfileInputSchema.parse(req.body);
        const id = await addHotspotServerProfile(req.mtConn, input);
        await invalidateServerProfileCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/hotspot/server-profiles/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'server-profile id wajib');
        const input = serverProfilePatchSchema.parse(req.body);
        await setHotspotServerProfile(req.mtConn, id, input);
        await invalidateServerProfileCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/hotspot/server-profiles/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'server-profile id wajib');
        await removeHotspotServerProfile(req.mtConn, id);
        await invalidateServerProfileCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// PPP Secrets CRUD (Phase A6) — delegates add/update/delete to billing.ts
// ─────────────────────────────────────────────────────────────────────────

const pppSecretAddSchema = z.object({
    name: z.string().min(1, 'name wajib'),
    password: z.string().min(1, 'password wajib'),
    profile: z.string().optional(),
    service: z.string().optional(),
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
});
const pppSecretPatchSchema = z.object({
    profile: z.string().optional(),
    password: z.string().optional(),
    service: z.string().optional(),
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
});

const pppSecretCacheKey = (routerId: string) => `mikhmon:${routerId}:ppp:secrets`;
const invalidatePppSecretCache = (routerId: string) =>
    cacheService.delete(pppSecretCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] ppp-secret cache invalidate failed'),
    );

router.get(
    '/:routerId/ppp/secrets',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = pppSecretCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await getPppSecrets(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/ppp/secrets',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = pppSecretAddSchema.parse(req.body);
        const id = await addPppSecret(req.mtConn, input);
        await invalidatePppSecretCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/ppp/secrets/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'secret id wajib');
        const input = pppSecretPatchSchema.parse(req.body);
        await updatePppSecret(req.mtConn, id, input);
        await invalidatePppSecretCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/ppp/secrets/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'secret id wajib');
        await deletePppSecret(req.mtConn, id);
        await invalidatePppSecretCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// PPP Profiles CRUD (Phase A6) — list+add from billing.ts, set+remove from ppp-advanced.ts
// ─────────────────────────────────────────────────────────────────────────

const pppProfileInputSchema = z.object({
    name: z.string().min(1, 'name wajib'),
    rateLimit: z.string().optional(),
    localAddress: z.string().optional(),
    remoteAddress: z.string().optional(),
    parentQueue: z.string().optional(),
    addressList: z.string().optional(),
    dnsServer: z.string().optional(),
    onlyOne: z.enum(['yes', 'no', 'default']).optional(),
    comment: z.string().optional(),
});
const pppProfilePatchSchema = pppProfileInputSchema.partial();

const pppProfileCacheKey = (routerId: string) => `mikhmon:${routerId}:ppp:profiles`;
const invalidatePppProfileCache = (routerId: string) =>
    cacheService.delete(pppProfileCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] ppp-profile cache invalidate failed'),
    );

router.get(
    '/:routerId/ppp/profiles',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = pppProfileCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await getPppProfiles(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_STATIC);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/ppp/profiles',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = pppProfileInputSchema.parse(req.body);
        const id = await addPppProfile(req.mtConn, input);
        await invalidatePppProfileCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/ppp/profiles/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'profile id wajib');
        const input = pppProfilePatchSchema.parse(req.body);
        await setPppProfile(req.mtConn, id, input);
        await invalidatePppProfileCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/ppp/profiles/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'profile id wajib');
        await removePppProfile(req.mtConn, id);
        await invalidatePppProfileCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// PPP Active sessions (Phase A6) — live, kick-only
// ─────────────────────────────────────────────────────────────────────────

router.get(
    '/:routerId/ppp/active',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const items = await listPppActive(req.mtConn);
        res.json({ data: items });
    })
);

router.delete(
    '/:routerId/ppp/active/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'session id wajib');
        await removePppActive(req.mtConn, id);
        res.json({ data: { id, kicked: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// IP Pool CRUD (Phase A7)
// ─────────────────────────────────────────────────────────────────────────

const ipPoolInputSchema = z.object({
    name: z.string().min(1, 'name wajib'),
    ranges: z.string().min(1, 'ranges wajib'),
    nextPool: z.string().optional(),
    comment: z.string().optional(),
});
const ipPoolPatchSchema = ipPoolInputSchema.partial();

const ipPoolCacheKey = (routerId: string) => `mikhmon:${routerId}:ip:pool`;
const invalidateIpPoolCache = (routerId: string) =>
    cacheService.delete(ipPoolCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] ip-pool cache invalidate failed'),
    );

router.get(
    '/:routerId/ip/pool',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = ipPoolCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listIpPools(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_STATIC);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/ip/pool',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = ipPoolInputSchema.parse(req.body);
        const id = await addIpPool(req.mtConn, input);
        await invalidateIpPoolCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/ip/pool/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'pool id wajib');
        const input = ipPoolPatchSchema.parse(req.body);
        await setIpPool(req.mtConn, id, input);
        await invalidateIpPoolCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/ip/pool/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'pool id wajib');
        await removeIpPool(req.mtConn, id);
        await invalidateIpPoolCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// DHCP Lease (Phase A7) — list, add, set, make-static, remove
// ─────────────────────────────────────────────────────────────────────────

const dhcpLeaseInputSchema = z.object({
    address: z.string().min(1, 'address wajib'),
    macAddress: z.string().optional(),
    clientId: z.string().optional(),
    server: z.string().optional(),
    comment: z.string().optional(),
    blocked: z.boolean().optional(),
    disabled: z.boolean().optional(),
});
const dhcpLeasePatchSchema = dhcpLeaseInputSchema.partial();

const dhcpLeaseCacheKey = (routerId: string) => `mikhmon:${routerId}:ip:dhcp-lease`;
const invalidateDhcpLeaseCache = (routerId: string) =>
    cacheService.delete(dhcpLeaseCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] dhcp-lease cache invalidate failed'),
    );

router.get(
    '/:routerId/ip/dhcp-lease',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = dhcpLeaseCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listDhcpLeases(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/ip/dhcp-lease',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = dhcpLeaseInputSchema.parse(req.body);
        const id = await addDhcpLease(req.mtConn, input);
        await invalidateDhcpLeaseCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/ip/dhcp-lease/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'lease id wajib');
        const input = dhcpLeasePatchSchema.parse(req.body);
        await setDhcpLease(req.mtConn, id, input);
        await invalidateDhcpLeaseCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.post(
    '/:routerId/ip/dhcp-lease/:id/make-static',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'lease id wajib');
        await makeDhcpLeaseStatic(req.mtConn, id);
        await invalidateDhcpLeaseCache(paramStr(req.params.routerId));
        res.json({ data: { id, madeStatic: true } });
    })
);

router.delete(
    '/:routerId/ip/dhcp-lease/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'lease id wajib');
        await removeDhcpLease(req.mtConn, id);
        await invalidateDhcpLeaseCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// Firewall Address List (Phase A7)
// ─────────────────────────────────────────────────────────────────────────

const addressListInputSchema = z.object({
    list: z.string().min(1, 'list wajib'),
    address: z.string().min(1, 'address wajib'),
    comment: z.string().optional(),
    timeout: z.string().optional(),
    disabled: z.boolean().optional(),
});
const addressListPatchSchema = addressListInputSchema.partial();

const addressListCacheKey = (routerId: string) => `mikhmon:${routerId}:ip:address-list`;
const invalidateAddressListCache = (routerId: string) =>
    cacheService.delete(addressListCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] address-list cache invalidate failed'),
    );

router.get(
    '/:routerId/ip/address-list',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = addressListCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listAddressList(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/ip/address-list',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = addressListInputSchema.parse(req.body);
        const id = await addAddressList(req.mtConn, input);
        await invalidateAddressListCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/ip/address-list/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'address-list id wajib');
        const input = addressListPatchSchema.parse(req.body);
        await setAddressList(req.mtConn, id, input);
        await invalidateAddressListCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/ip/address-list/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'address-list id wajib');
        await removeAddressList(req.mtConn, id);
        await invalidateAddressListCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// System Log (Phase A8) — uncached, live read
// ─────────────────────────────────────────────────────────────────────────

router.get(
    '/:routerId/system/log',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const topics = typeof req.query.topics === 'string' ? req.query.topics : undefined;
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
        const entries = await getLog(req.mtConn, { topics, limit });
        res.json({ data: entries });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// System Packages (Phase A8) — read-only
// ─────────────────────────────────────────────────────────────────────────

router.get(
    '/:routerId/system/packages',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = `mikhmon:${routerId}:system:packages`;
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await listSystemPackages(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_STATIC);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// System Scheduler (Phase A8) — list+add+delete reuse billing.ts,
// set comes from system-extra.ts
// ─────────────────────────────────────────────────────────────────────────

const schedulerInputSchema = z.object({
    name: z.string().min(1, 'name wajib'),
    onEvent: z.string().min(1, 'on-event wajib'),
    startTime: z.string().optional(),
    startDate: z.string().optional(),
    interval: z.string().optional(),
    comment: z.string().optional(),
    disabled: z.boolean().optional(),
});
const schedulerPatchSchema = schedulerInputSchema.partial();

const schedulerCacheKey = (routerId: string) => `mikhmon:${routerId}:system:scheduler`;
const invalidateSchedulerCache = (routerId: string) =>
    cacheService.delete(schedulerCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] scheduler cache invalidate failed'),
    );

router.get(
    '/:routerId/system/scheduler',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = schedulerCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached });
        }
        const items = await getSchedulers(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items });
    })
);

router.post(
    '/:routerId/system/scheduler',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const input = schedulerInputSchema.parse(req.body);
        const id = await addScheduler(req.mtConn, input);
        await invalidateSchedulerCache(paramStr(req.params.routerId));
        res.status(201).json({ data: { id } });
    })
);

router.patch(
    '/:routerId/system/scheduler/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'scheduler id wajib');
        const input = schedulerPatchSchema.parse(req.body);
        await setScheduler(req.mtConn, id, input);
        await invalidateSchedulerCache(paramStr(req.params.routerId));
        res.json({ data: { id, updated: true } });
    })
);

router.delete(
    '/:routerId/system/scheduler/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'scheduler id wajib');
        await deleteScheduler(req.mtConn, id);
        await invalidateSchedulerCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

// ─────────────────────────────────────────────────────────────────────────
// MikHMON Vouchers (Phase A9)
//
// Behavior is intentionally identical to MikHMON external — writes go
// to /ip/hotspot/user with the v3 legacy comment format. The Billing
// app's parser picks them up automatically when the router is set to
// `hotspot_mode=mikhmon_bridge`. In `native` mode the response surface
// includes a `modeHint` flag so the UI can warn the operator that
// vouchers generated here will not sync to Billing.
// ─────────────────────────────────────────────────────────────────────────

const voucherGenerateSchema = z.object({
    count: z.number().int().min(1).max(500),
    length: z.number().int().min(3).max(20),
    charset: z.enum(['lower', 'upper', 'mix', 'num', 'alnum']).default('num'),
    prefix: z.string().optional(),
    profile: z.string().min(1, 'profile wajib'),
    server: z.string().optional(),
    mode: z.enum(['vc', 'up']).default('vc'),
    limitUptime: z.string().optional(),
    limitBytesTotal: z.string().optional(),
    noteOverride: z.string().optional(),
    commentPrefix: z.string().optional(),
});

const mikhmonVoucherCacheKey = (routerId: string) => `mikhmon:${routerId}:vouchers`;
const invalidateMikhmonVoucherCache = (routerId: string) =>
    cacheService.delete(mikhmonVoucherCacheKey(routerId)).catch((err) =>
        logger.warn({ err: err?.message, routerId }, '[MikHMON] voucher cache invalidate failed'),
    );

router.get(
    '/:routerId/vouchers',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const cacheKey = mikhmonVoucherCacheKey(routerId);
        const cached = await cacheService.get<any[]>(cacheKey);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json({ data: cached, modeHint: req.routerHotspotMode });
        }
        const items = await listMikhmonVouchers(req.mtConn);
        await cacheService.set(cacheKey, items, cacheService.TTL.MIKHMON_LIST);
        res.set('X-Cache', 'MISS');
        res.json({ data: items, modeHint: req.routerHotspotMode });
    })
);

router.post(
    '/:routerId/vouchers/generate',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const routerId = paramStr(req.params.routerId);
        const input = voucherGenerateSchema.parse(req.body);
        const created = await generateMikhmonVouchers(req.mtConn, routerId, input);
        await invalidateMikhmonVoucherCache(routerId);

        // Tell the UI whether Billing will pick these up automatically
        const modeHint = req.routerHotspotMode || 'disabled';
        res.set('X-Mode-Hint', modeHint);
        res.status(201).json({
            data: { created, count: created.length, modeHint },
        });
    })
);

router.delete(
    '/:routerId/vouchers/:id',
    resolveRouterContext({ connect: true }),
    asyncHandler(async (req, res) => {
        const id = paramStr(req.params.id);
        if (!id) throw new ApiError(400, 'voucher id wajib');
        await removeMikhmonVoucher(req.mtConn, id);
        await invalidateMikhmonVoucherCache(paramStr(req.params.routerId));
        res.json({ data: { id, deleted: true } });
    })
);

export default router;
