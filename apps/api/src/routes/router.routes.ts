import { Router } from 'express';
import { z } from 'zod';
import { routerService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { settingsService } from '../services/index.js';

const router = Router();

// Validation schemas
const createRouterSchema = z.object({
    name: z.string().min(1).max(100),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).optional().default(8728),
    username: z.string().min(1),
    password: z.string().min(1),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    location: z.string().optional(),
    locationImage: z.string().url().optional(),
    groupId: z.string().uuid().optional(),
    notificationGroupId: z.string().uuid().optional().nullable(),
    notes: z.string().optional(),
});

const updateRouterSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    location: z.string().optional(),
    locationImage: z.string().url().optional().nullable(),
    groupId: z.string().uuid().optional().nullable(),
    notificationGroupId: z.string().uuid().optional().nullable(),
    notes: z.string().optional(),
    status: z.enum(['online', 'offline', 'maintenance', 'unknown']).optional(),
});

const testConnectionSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).optional().default(8728),
    username: z.string().min(1),
    password: z.string().min(1),
});

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/routers
 * List all routers
 */
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const routers = await routerService.findAll(req.user?.id, req.user?.role);

        // Remove sensitive data
        const sanitized = routers.map(({ passwordEncrypted, ...router }) => router);

        res.json({ data: sanitized });
    })
);

/**
 * GET /api/routers/:id
 * Get router by ID
 */
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const router = await routerService.findById(id);

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        // Remove sensitive data
        const { passwordEncrypted, ...sanitized } = router;

        res.json({ data: sanitized });
    })
);

/**
 * POST /api/routers
 * Create a new router
 * Requires: Operator or Admin
 */
router.post(
    '/',
    requireOperator,
    asyncHandler(async (req, res) => {
        const data = createRouterSchema.parse(req.body);
        let newRouter = await routerService.create(data);

        // Log action
        await settingsService.logAction(
            'create',
            'router',
            newRouter.id,
            req.user!.id,
            { name: newRouter.name, host: newRouter.host },
            req
        );

        // Immediately try to connect and refresh status
        try {
            const refreshed = await routerService.refreshRouterStatus(newRouter.id);
            if (refreshed) {
                newRouter = refreshed;
            }
        } catch (err) {
            console.log('Initial refresh failed for router:', newRouter.id, err);
            // Router was created but connection failed - that's okay
        }

        // Remove sensitive data
        const { passwordEncrypted, ...sanitized } = newRouter;

        res.status(201).json({ data: sanitized });
    })
);

/**
 * PUT /api/routers/:id
 * Update router
 * Requires: Operator or Admin
 */
router.put(
    '/:id',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const data = updateRouterSchema.parse(req.body);

        const updateData: any = { ...data };
        // Remove nulls if they exist, or handle them specifically if DB allows null
        if (updateData.locationImage === null) updateData.locationImage = undefined; // App doesn't store null images probably
        if (updateData.locationImage === null) updateData.locationImage = undefined; // App doesn't store null images probably
        if (updateData.groupId === null) updateData.groupId = null; // groupId can be null
        if (updateData.notificationGroupId === null) updateData.notificationGroupId = null; // notificationGroupId can be null

        const router = await routerService.update(id, updateData);

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        // Log action
        await settingsService.logAction(
            'update',
            'router',
            router.id,
            req.user!.id,
            { changes: Object.keys(data) },
            req
        );

        // Remove sensitive data
        const { passwordEncrypted, ...sanitized } = router;

        res.json({ data: sanitized });
    })
);

/**
 * DELETE /api/routers/:id
 * Delete router
 * Requires: Admin
 */
router.delete(
    '/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const router = await routerService.findById(id);

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        const deleted = await routerService.delete(id);

        if (!deleted) {
            throw ApiError.internal('Failed to delete router');
        }

        // Log action
        await settingsService.logAction(
            'delete',
            'router',
            id,
            req.user!.id,
            { name: router.name },
            req
        );

        res.json({ message: 'Router deleted successfully' });
    })
);

/**
 * POST /api/routers/:id/test-connection
 * Test connection to an existing router
 * Requires: Operator or Admin
 */
router.post(
    '/:id/test-connection',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await routerService.testConnection(id);

        res.json({ data: result });
    })
);

/**
 * POST /api/routers/test-connection
 * Test connection with provided credentials (before saving)
 * Requires: Operator or Admin
 */
router.post(
    '/test-connection',
    requireOperator,
    asyncHandler(async (req, res) => {
        const data = testConnectionSchema.parse(req.body);
        const result = await routerService.testConnectionWithCredentials(
            data.host,
            data.port,
            data.username,
            data.password
        );

        res.json({ data: result });
    })
);

/**
 * POST /api/routers/:id/refresh
 * Refresh router status and fetch latest data
 * Requires: Operator or Admin
 */
router.post(
    '/:id/refresh',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const router = await routerService.refreshRouterStatus(id);

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        // Remove sensitive data
        const { passwordEncrypted, ...sanitized } = router;

        res.json({ data: sanitized });
    })
);

/**
 * POST /api/routers/:id/reboot
 * Reboot a router
 * Requires: Admin
 */
router.post(
    '/:id/reboot',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const router = await routerService.findById(id);

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        const result = await routerService.reboot(id);

        // Log action
        await settingsService.logAction(
            'reboot',
            'router',
            id,
            req.user!.id,
            { name: router.name, success: result.success },
            req
        );

        res.json({ data: result });
    })
);

/**
 * GET /api/routers/:id/interfaces
 * Get router interfaces
 */
router.get(
    '/:id/interfaces',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const interfaces = await routerService.getInterfaces(id);

        res.json({ data: interfaces });
    })
);

/**
 * GET /api/routers/:id/metrics
 * Get latest router metrics
 */
router.get(
    '/:id/metrics',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const metrics = await routerService.getLatestMetrics(id);

        res.json({ data: metrics });
    })
);

/**
 * GET /api/routers/:id/metrics/history
 * Get router metrics history
 */
router.get(
    '/:id/metrics/history',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;
        const metrics = await routerService.getMetricsHistory(id, limit);

        res.json({ data: metrics });
    })
);

/**
 * GET /api/routers/:id/ping-latencies
 * Get ping latency to configured targets via this router
 */
router.get(
    '/:id/ping-latencies',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const latencies = await routerService.measurePingTargets(id);
        res.json({ data: latencies });
    })
);


/**
 * GET /api/routers/:id/hotspot/active
 * Get active hotspot users count
 */
router.get(
    '/:id/hotspot/active',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const count = await routerService.getHotspotActive(id);
        res.json({ data: { count } });
    })
);

/**
 * GET /api/routers/:id/ppp/active
 * Get active PPP connections count
 */
router.get(
    '/:id/ppp/active',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const count = await routerService.getPppActive(id);
        res.json({ data: { count } });
    })
);

/**
 * GET /api/routers/:id/ppp/sessions
 * Get active PPP sessions with details
 */
router.get(
    '/:id/ppp/sessions',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const sessions = await routerService.getPppSessions(id);
        res.json({ data: sessions });
    })
);
// ==================== NETWATCH ROUTES ====================

const createNetwatchSchema = z.object({
    host: z.string().optional(), // Optional for ODP devices
    name: z.string().optional(),
    interval: z.number().int().min(5).max(3600).optional().default(30),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    location: z.string().optional(),
    deviceType: z.enum(['client', 'olt', 'odp']).optional(),
    waypoints: z.string().optional(),
    connectionType: z.enum(['router', 'client']).optional(),
    connectedToId: z.string().uuid().optional(),
});

const updateNetwatchSchema = z.object({
    host: z.string().optional(), // Allow empty string for ODP
    name: z.string().optional(),
    interval: z.number().int().min(5).max(3600).optional(),
    latitude: z.preprocess((val) => {
        if (val === '' || val === null || val === undefined) return undefined;
        return val;
    }, z.string().optional()),
    longitude: z.preprocess((val) => {
        if (val === '' || val === null || val === undefined) return undefined;
        return val;
    }, z.string().optional()),
    location: z.string().optional(),
    status: z.enum(['up', 'down', 'unknown']).optional(),
    deviceType: z.enum(['client', 'olt', 'odp']).optional(),
    waypoints: z.string().optional(),
    connectionType: z.enum(['router', 'client']).optional(),
    connectedToId: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/routers/:id/netwatch
 * Get all netwatch entries for a router
 */
router.get(
    '/:id/netwatch',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const netwatch = await routerService.getNetwatch(id);
        res.json({ data: netwatch });
    })
);

/**
 * POST /api/routers/:id/netwatch
 * Create a netwatch entry
 */
router.post(
    '/:id/netwatch',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const data = createNetwatchSchema.parse(req.body);
        const netwatch = await routerService.createNetwatch(id, data);

        await settingsService.logAction(
            'create',
            'netwatch',
            netwatch.id,
            req.user!.id,
            { host: netwatch.host, routerId: id },
            req
        );

        res.status(201).json({ data: netwatch });
    })
);

/**
 * PUT /api/routers/:id/netwatch/:netwatchId
 * Update a netwatch entry
 */
router.put(
    '/:id/netwatch/:netwatchId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id, netwatchId } = req.params;

        console.log('DEBUG: Netwatch update route hit');
        console.log('DEBUG: Params:', req.params);
        console.log('DEBUG: User:', req.user);
        console.log('DEBUG: Body type:', typeof req.body);
        console.log('DEBUG: Body:', req.body);

        if (!req.body) {
            console.error('DEBUG: req.body is undefined!');
            throw new ApiError(400, 'Request body is missing');
        }

        try {
            console.log('DEBUG: Parsing schema...');
            // Log body types for debugging
            console.log('DEBUG: Body types:', {
                interval: typeof req.body.interval,
                latitude: typeof req.body.latitude,
                longitude: typeof req.body.longitude
            });

            const parseResult = updateNetwatchSchema.safeParse(req.body);

            if (!parseResult.success) {
                // Use JSON.stringify to avoid console.error crash on ZodError
                const errorFormatted = parseResult.error.format();
                console.error('DEBUG: Schema validation failed:', JSON.stringify(errorFormatted, null, 2));
                throw new ApiError(400, 'Validation failed: ' + parseResult.error.message);
            }

            const data = parseResult.data;
            console.log('DEBUG: Schema parsed successfully:', data);

            console.log('DEBUG: Calling routerService.updateNetwatch...');
            const netwatch = await routerService.updateNetwatch(id, netwatchId, data);
            console.log('DEBUG: routerService returned:', netwatch);

            if (!netwatch) {
                throw new ApiError(404, 'Netwatch entry not found');
            }

            // ... logging ...
            // await settingsService.logAction(
            //     'update',
            //     'netwatch',
            //     netwatchId,
            //     req.user!.id,
            //     { host: netwatch.host },
            //     req
            // );

            res.json({ data: netwatch });
        } catch (error: any) {
            console.error('DEBUG: Caught error in route handler:', error.message);
            throw error;
        }
    })
);

/**
 * DELETE /api/routers/:id/netwatch/:netwatchId
 * Delete a netwatch entry
 */
router.delete(
    '/:id/netwatch/:netwatchId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id, netwatchId } = req.params;
        const deleted = await routerService.deleteNetwatch(id, netwatchId);

        if (!deleted) {
            throw new ApiError(404, 'Netwatch entry not found');
        }

        await settingsService.logAction(
            'delete',
            'netwatch',
            netwatchId,
            req.user!.id,
            {},
            req
        );

        res.json({ success: true });
    })
);

/**
 * POST /api/routers/:id/netwatch/sync
 * Sync netwatch entries from MikroTik router to database
 */
router.post(
    '/:id/netwatch/sync',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await routerService.syncNetwatchFromRouter(id);

        await settingsService.logAction(
            'sync',
            'netwatch',
            id,
            req.user!.id,
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

export default router;

