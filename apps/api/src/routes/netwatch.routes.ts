import { Router } from 'express';
import { z } from 'zod';
import { routerService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { settingsService } from '../services/index.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { logger } from '../lib/logger.js';

// Merge params to access :id from parent router
const router = Router({ mergeParams: true });

// Validation schemas
const createNetwatchSchema = z.object({
    host: z.string().optional(),
    name: z.string().optional(),
    interval: z.number().int().min(5).max(3600).optional().default(30),
    latitude: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().optional()),
    longitude: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().optional()),
    location: z.preprocess((val) => (val === null ? undefined : val), z.string().optional()),
    // Map-node type 'netwatch' (UI concept) → DB enum 'client'. Frontend
    // kadang kirim 'netwatch' (generic marker type) yang bukan device type DB.
    deviceType: z.preprocess(
        (v) => (v === 'netwatch' ? 'client' : v),
        z.enum(['client', 'olt', 'odp', 'router', 'switch']).optional(),
    ),
    waypoints: z.string().optional(),
    connectionType: z.enum(['router', 'client']).optional(),
    // connectedToId mereferensikan device heterogen (netwatch/onu/pppoe) yang
    // ID-nya tidak selalu uuid murni di map. Pakai string biasa, bukan .uuid(),
    // supaya "Through Another Client" tidak ditolak 400.
    connectedToId: z.string().optional().nullable(),
    targetInterface: z.string().optional().nullable(),
    linkedOnuId: z.string().optional().nullable(),
    isAppOnly: z.boolean().optional(),
    portCapacity: z.number().int().min(1).max(128).optional(),
    splitterRatio: z.string().optional().nullable(),
});

const updateNetwatchSchema = z.object({
    host: z.string().optional(),
    name: z.string().optional(),
    interval: z.number().int().min(5).max(3600).optional(),
    latitude: z.string().optional().nullable(),
    longitude: z.string().optional().nullable(),
    location: z.string().nullable().optional(),
    status: z.enum(['up', 'down', 'unknown']).optional(),
    // Map-node type 'netwatch' → DB enum 'client' (lihat catatan di create schema).
    deviceType: z.preprocess(
        (v) => (v === 'netwatch' ? 'client' : v),
        z.enum(['client', 'olt', 'odp', 'router', 'switch']).optional(),
    ),
    waypoints: z.string().nullable().optional(),
    distanceMarkers: z.string().nullable().optional(), // JSON penanda jarak
    fiberCores: z.string().nullable().optional(),       // JSON fiber multi-core
    connectionType: z.enum(['router', 'client']).optional(),
    // Lihat catatan di createNetwatchSchema — string biasa, bukan .uuid().
    connectedToId: z.string().optional().nullable(),
    targetInterface: z.string().optional().nullable(),
    linkedOnuId: z.string().optional().nullable(),
    // Setting linkLocked=true tells the auto-linkage layer to leave this row
    // alone. Surfaced via the marker popup as a small badge.
    linkLocked: z.boolean().optional(),
    linkSource: z.string().optional().nullable(),
    isAppOnly: z.boolean().optional(),
    portCapacity: z.number().int().min(1).max(128).optional(),
    splitterRatio: z.string().optional().nullable(),
});

// Sanitize payload sebelum validasi: empty string → undefined untuk field
// opsional. Dipakai POST + PUT supaya konsisten (sebelumnya hanya POST yang
// sanitize, PUT langsung parse → '' di field tertentu bisa lolos/ganggu).
function sanitizeNetwatchBody(body: Record<string, unknown>): Record<string, unknown> {
    const out = { ...body };
    for (const key of ['host', 'connectedToId', 'targetInterface', 'linkedOnuId', 'latitude', 'longitude', 'location']) {
        if (out[key] === '') out[key] = undefined;
    }
    return out;
}

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/routers/:id/netwatch
 * Get all netwatch entries for a router
 */
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const netwatch = await routerService.getNetwatch(id, getEffectiveTenantId(req));
        res.json({ data: netwatch });
    })
);

/**
 * POST /api/routers/:id/netwatch
 * Create a netwatch entry
 */
router.post(
    '/',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;

        const rawData = sanitizeNetwatchBody(req.body);
        const data = createNetwatchSchema.parse(rawData);
        const netwatch = await routerService.createNetwatch(id, data, getEffectiveTenantId(req));

        await settingsService.logAction(
            'create',
            'netwatch',
            netwatch.id,
            req.user!.id,
            req.user!.tenantId!,
            { host: netwatch.host, routerId: id },
            req
        );

        res.status(201).json({ data: netwatch });
    })
);

/**
 * POST /api/routers/:id/netwatch/sync
 * Sync netwatch entries from MikroTik router to database
 */
router.post(
    '/sync',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const result = await routerService.syncNetwatchFromRouter(id);

        await settingsService.logAction(
            'sync',
            'netwatch',
            id,
            req.user!.id,
            req.user!.tenantId!,
            { synced: result.synced },
            req
        );

        res.json({
            data: {
                success: result.errors.length === 0,
                synced: result.synced,
                errors: result.errors,
            }
        });
    })
);

/**
 * PUT /api/routers/:id/netwatch/:netwatchId
 * Update a netwatch entry
 */
router.put(
    '/:netwatchId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id, netwatchId } = req.params as { id: string; netwatchId: string };

        if (!req.body) {
            throw new ApiError(400, 'Request body is missing');
        }

        // Diagnostic: log payload + exact failing field saat validasi gagal,
        // supaya 400 bisa di-trace dari pm2 logs tanpa nebak.
        const sanitized = sanitizeNetwatchBody(req.body);
        const parsed = updateNetwatchSchema.safeParse(sanitized);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
                code: i.code,
            }));
            logger.warn(
                { netwatchId, routerId: id, issues, receivedBody: req.body },
                '[Netwatch PUT] Validation failed',
            );
            throw new ApiError(400, 'Invalid netwatch data', issues);
        }
        const data = parsed.data;
        const netwatch = await routerService.updateNetwatch(id, netwatchId, data, getEffectiveTenantId(req));

        if (!netwatch) {
            throw new ApiError(404, 'Netwatch entry not found');
        }

        res.json({ data: netwatch });
    })
);

/**
 * GET /api/routers/:id/netwatch/:netwatchId/history
 * Last 50 IP changes for a netwatch entry (auto-heal + manual edits)
 */
router.get(
    '/:netwatchId/history',
    asyncHandler(async (req, res) => {
        const { netwatchId } = req.params as { netwatchId: string };
        const { getHistory } = await import('../services/netwatch/netwatch-autoheal.service.js');
        const history = await getHistory(netwatchId, 50);
        res.json({ data: history });
    })
);

/**
 * POST /api/routers/:id/netwatch/:netwatchId/heal-now
 * Manually trigger auto-heal for a single netwatch entry (debug helper)
 */
router.post(
    '/:netwatchId/heal-now',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id, netwatchId } = req.params as { id: string; netwatchId: string };
        const { resolveCurrentIp } = await import('../services/netwatch/netwatch-autoheal.service.js');
        const resolved = await resolveCurrentIp(netwatchId);
        if (!resolved) {
            throw new ApiError(404, 'Netwatch entry not found or has no linkedOnuId');
        }
        if (!resolved.sourceIp) {
            return res.json({ data: { healed: false, reason: 'no_active_session', resolved } });
        }
        if (resolved.sourceIp === resolved.currentIp) {
            return res.json({ data: { healed: false, reason: 'already_in_sync', resolved } });
        }
        const reason = resolved.source === 'pppoe' ? 'auto_heal_pppoe' : 'auto_heal_acs';
        const updated = await routerService.updateNetwatch(id, netwatchId, { host: resolved.sourceIp }, getEffectiveTenantId(req), {
            reason,
            changedBy: req.user!.id,
            pppoeUser: resolved.pppoeUser,
            onuId: resolved.onuId,
        });
        res.json({ data: { healed: !!updated, oldHost: resolved.currentIp, newHost: resolved.sourceIp, source: resolved.source } });
    })
);

/**
 * POST /api/routers/:id/netwatch/conflicts/resolve
 * Resolve one or more sync conflicts. Operator picks the source of truth:
 *  - source='mikrotik' → adopt mikrotik_host into host (delete the diverged copies)
 *  - source='app'      → push the current app host to MikroTik (overwriting)
 *
 * Body: { entryIds: string[], source: 'mikrotik' | 'app' }
 *
 * Both single-row and bulk operations go through this endpoint so the UI
 * can use one mutation hook for both flows.
 */
router.post(
    '/conflicts/resolve',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id: routerId } = req.params as { id: string };
        const body = z.object({
            entryIds: z.array(z.string().uuid()).min(1).max(200),
            source: z.enum(['mikrotik', 'app']),
        }).parse(req.body);

        const { resolveConflicts } = await import('../services/netwatch/netwatch-core.service.js');
        const result = await resolveConflicts(
            routerId,
            body.entryIds,
            body.source,
            getEffectiveTenantId(req),
            req.user!.id,
        );

        await settingsService.logAction(
            'resolve_conflict',
            'netwatch',
            body.entryIds.join(','),
            req.user!.id,
            req.user!.tenantId!,
            { source: body.source, count: body.entryIds.length, result },
            req
        );

        res.json({ data: result });
    })
);

/**
 * GET /api/routers/:id/netwatch/conflicts
 * List rows currently in sync_state='conflict' for this router.
 * Used by the banner badge count + Conflicts panel.
 */
router.get(
    '/conflicts',
    asyncHandler(async (req, res) => {
        const { id: routerId } = req.params as { id: string };
        const { listConflicts } = await import('../services/netwatch/netwatch-core.service.js');
        const conflicts = await listConflicts(routerId, getEffectiveTenantId(req));
        res.json({ data: conflicts });
    })
);

/**
 * DELETE /api/routers/:id/netwatch/:netwatchId
 * Delete a netwatch entry
 */
router.delete(
    '/:netwatchId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id, netwatchId } = req.params as { id: string; netwatchId: string };

        // Three delete modes:
        //   ?mode=both         — delete from app + MikroTik (default, full removal)
        //   ?mode=app_only     — delete app row only, MikroTik keeps entry
        //   ?mode=mikrotik_only — delete MikroTik entry, app row stays (is_app_only=true)
        //
        // Legacy compat: ?deleteFromMikrotik=false maps to mode='app_only'.
        const rawMode = (req.query.mode as string | undefined) || '';
        let mode: 'both' | 'app_only' | 'mikrotik_only' = 'both';
        if (rawMode === 'app_only' || rawMode === 'mikrotik_only') {
            mode = rawMode;
        } else if (req.query.deleteFromMikrotik === 'false') {
            mode = 'app_only';
        }

        const deleted = await routerService.deleteNetwatch(id, netwatchId, getEffectiveTenantId(req), { mode });

        if (!deleted) {
            throw new ApiError(404, 'Netwatch entry not found');
        }

        await settingsService.logAction(
            'delete',
            'netwatch',
            netwatchId,
            req.user!.id,
            req.user!.tenantId!,
            { mode },
            req
        );

        res.json({ data: { success: true, mode } });
    })
);

export default router;
