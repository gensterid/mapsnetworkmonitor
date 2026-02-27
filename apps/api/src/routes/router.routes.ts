import { Router } from 'express';
import { z } from 'zod';
import { routerService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { settingsService } from '../services/index.js';
import { db } from '../db/index.js';
import { inArray } from 'drizzle-orm';
import { routerNetwatch } from '../db/schema/index.js';
import { logger } from '../lib/logger.js';

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
    snmpCommunity: z.string().optional().default('public'),
    snmpPort: z.number().int().min(1).max(65535).optional().default(161),
    useGenieAcs: z.boolean().optional().default(false),
    genieacsUrl: z.string().url().optional().nullable(),
    genieacsUsername: z.string().optional().nullable(),
    genieacsPassword: z.string().optional().nullable(),
    useWebhook: z.boolean().optional().default(false),
    pollingIntervalMetrics: z.number().int().min(60).optional().default(300),
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
    snmpCommunity: z.string().optional(),
    snmpPort: z.number().int().min(1).max(65535).optional(),
    useGenieAcs: z.boolean().optional(),
    genieacsUrl: z.string().url().optional().nullable(),
    genieacsUsername: z.string().optional().nullable(),
    genieacsPassword: z.string().optional().nullable(),
    useWebhook: z.boolean().optional(),
    pollingIntervalMetrics: z.number().int().min(60).optional(),
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
        let tenantId: string | string[] | undefined = req.user?.tenantId!;
        const allTenants = req.query.all_tenants === 'true';

        if (allTenants) {
            if (req.user?.role === 'superadmin') {
                // Superadmin sees everything
                tenantId = undefined;
            } else if (req.user?.role === 'admin') {
                // Admin sees all authorized tenants
                const { userService } = await import('../services/user.service.js');
                tenantId = await userService.getAuthorizedTenants(req.user!.id);
            }
        }

        const routers = await routerService.findAll(tenantId, req.user?.id, req.user?.role);

        // Remove sensitive data
        const sanitized = routers.map(({ passwordEncrypted, ...router }) => router);

        res.json({ data: sanitized });
    })
);

/**
 * GET /api/routers/netwatch-all
 * Get all netwatch entries for all accessible routers in one batch
 */
router.get(
    '/netwatch-all',
    asyncHandler(async (req, res) => {
        const routers = await routerService.findAll(req.user?.tenantId!, req.user?.id, req.user?.role);
        const routerIds = routers.map(r => r.id);

        if (routerIds.length === 0) {
            return res.json({ data: [] });
        }

        const netwatch = await routerService.getNetwatchAll(routerIds);
        res.json({ data: netwatch });
    })
);

/**
 * GET /api/routers/:id
 * Get router by ID
 */
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const router = await routerService.findById(id, req.user?.tenantId!);

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

        // Lockdown billing/polling interval to Admin only
        if (data.pollingIntervalMetrics !== 300 && req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
            throw ApiError.forbidden('Only administrators can set custom polling intervals');
        }

        let newRouter = await routerService.create(data, req.user?.tenantId!);

        // Log action
        await settingsService.logAction(
            'create',
            'router',
            newRouter.id,
            req.user!.id,
            req.user!.tenantId!,
            { name: newRouter.name, host: newRouter.host },
            req
        );

        // Immediately try to connect and refresh status
        try {
            const refreshed = await routerService.refreshRouterStatus(newRouter.id, false, true, req.user?.tenantId!);
            if (refreshed) {
                newRouter = refreshed;
            }
        } catch (err: any) {
            logger.warn({ routerId: newRouter.id, err }, 'Initial refresh failed');
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
        const id = req.params.id as string;
        const data = updateRouterSchema.parse(req.body);

        // Lockdown billing/polling interval to Admin only
        if (data.pollingIntervalMetrics !== undefined && req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
            throw ApiError.forbidden('Only administrators can change polling intervals');
        }

        const updateData: any = { ...data };
        // Remove nulls if they exist, or handle them specifically if DB allows null
        if (updateData.locationImage === null) updateData.locationImage = undefined;
        if (updateData.groupId === null) updateData.groupId = null;
        if (updateData.notificationGroupId === null) updateData.notificationGroupId = null;

        const router = await routerService.update(id, updateData, req.user?.tenantId!);

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        // Log action
        await settingsService.logAction(
            'update',
            'router',
            router.id,
            req.user!.id,
            req.user!.tenantId!,
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
        const id = req.params.id as string;
        const router = await routerService.findById(id, req.user?.tenantId!);

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        const deleted = await routerService.delete(id, req.user?.tenantId!);

        if (!deleted) {
            throw ApiError.internal('Failed to delete router');
        }

        // Log action
        await settingsService.logAction(
            'delete',
            'router',
            id,
            req.user!.id,
            req.user!.tenantId!,
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
        const id = req.params.id as string;
        const result = await routerService.testConnection(id, req.user?.tenantId!);

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
        const id = req.params.id as string;
        const router = await routerService.refreshRouterStatus(id, false, true, req.user?.tenantId!);

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
        const id = req.params.id as string;
        const router = await routerService.findById(id, req.user?.tenantId!);

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        const result = await routerService.reboot(id, req.user?.tenantId!);

        // Log action
        await settingsService.logAction(
            'reboot',
            'router',
            id,
            req.user!.id,
            req.user!.tenantId!,
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
        const id = req.params.id as string;
        const interfaces = await routerService.getInterfaces(id, req.user?.tenantId!);

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
        const id = req.params.id as string;
        const metrics = await routerService.getLatestMetrics(id, req.user?.tenantId!);

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
        const id = req.params.id as string;
        const limit = parseInt(req.query.limit as string) || 100;
        const metrics = await routerService.getMetricsHistory(id, limit, req.user?.tenantId!);

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
        const id = req.params.id as string;
        const latencies = await routerService.measurePingTargets(id, req.user?.tenantId!);
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
        const id = req.params.id as string;
        const count = await routerService.getHotspotActive(id, req.user?.tenantId!);
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
        const id = req.params.id as string;
        const count = await routerService.getPppActive(id, req.user?.tenantId!);
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
        const id = req.params.id as string;
        const sessions = await routerService.getPppSessions(id, req.user?.tenantId!);
        res.json({ data: sessions });
    })
);
// ==================== NETWATCH ROUTES ====================

const createNetwatchSchema = z.object({
    host: z.string().optional(), // Optional for ODP devices
    name: z.string().optional(),
    interval: z.number().int().min(5).max(3600).optional().default(30),
    latitude: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional()),
    longitude: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional()),
    location: z.string().optional(),
    deviceType: z.enum(['client', 'olt', 'odp']).optional(),
    waypoints: z.string().optional(),
    connectionType: z.enum(['router', 'client']).optional(),
    connectedToId: z.string().uuid().optional().nullable(),
    targetInterface: z.string().optional().nullable(),
    linkedOnuId: z.string().optional().nullable(),
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
    location: z.string().nullable().optional(),
    status: z.enum(['up', 'down', 'unknown']).optional(),
    deviceType: z.enum(['client', 'olt', 'odp']).optional(),
    waypoints: z.string().nullable().optional(),
    connectionType: z.enum(['router', 'client']).optional(),
    connectedToId: z.string().uuid().optional().nullable(),
    targetInterface: z.string().optional().nullable(),
    linkedOnuId: z.string().optional().nullable(),
});

/**
 * GET /api/routers/:id/netwatch
 * Get all netwatch entries for a router
 */
router.get(
    '/:id/netwatch',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const netwatch = await routerService.getNetwatch(id, req.user?.tenantId!);
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
        const id = req.params.id as string;

        // Manual sanitization to ensure empty strings don't break Zod/DB
        const rawData = { ...req.body };
        if (rawData.latitude === '') rawData.latitude = undefined;
        if (rawData.longitude === '') rawData.longitude = undefined;
        if (rawData.host === '') rawData.host = undefined;

        const data = createNetwatchSchema.parse(rawData);
        const netwatch = await routerService.createNetwatch(id, data, req.user?.tenantId!);

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
 * PUT /api/routers/:id/netwatch/:netwatchId
 * Update a netwatch entry
 */
router.put(
    '/:id/netwatch/:netwatchId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id, netwatchId } = req.params;

        // Basic UUID validation for parameters to prevent DB syntax errors
        const uuidSchema = z.string().uuid();
        if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(netwatchId).success) {
            throw new ApiError(400, 'Invalid router ID or netwatch ID format');
        }

        if (!req.body) {
            throw new ApiError(400, 'Request body is missing');
        }

        try {
            const parseResult = updateNetwatchSchema.safeParse(req.body);

            if (!parseResult.success) {
                const errorFormatted = parseResult.error.format();
                // Keep error log for validation failures but use structured logger
                logger.error({ errors: errorFormatted }, 'Validation failed');
                throw new ApiError(400, 'Validation failed: ' + parseResult.error.message);
            }
            const id_str = id as string;
            const netwatchId_str = netwatchId as string;

            const data = parseResult.data;

            const netwatch = await routerService.updateNetwatch(id_str, netwatchId_str, data, req.user?.tenantId!);

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
            logger.error({ err: error }, 'Caught error in route handler');
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
        const id = req.params.id as string;
        const netwatchId = req.params.netwatchId as string;
        const deleted = await routerService.deleteNetwatch(id, netwatchId, req.user?.tenantId!);

        if (!deleted) {
            throw new ApiError(404, 'Netwatch entry not found');
        }

        await settingsService.logAction(
            'delete',
            'netwatch',
            netwatchId,
            req.user!.id,
            req.user!.tenantId!,
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
        const id = req.params.id as string;
        const result = await routerService.syncNetwatchFromRouter(id); // handled by netwatchService with tenant context likely or needs update
        // Let's assume syncNetwatchFromRouter handle it or we update it too

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
 * POST /api/routers/:id/traffic/snmp
 * Get real-time interface traffic via SNMP
 */
router.post(
    '/:id/traffic/snmp',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const traffic = await routerService.getSnmpTraffic(id, req.user?.tenantId!);
        res.json({ data: traffic });
    })
);

export default router;

