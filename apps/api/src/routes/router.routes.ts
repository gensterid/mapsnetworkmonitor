import { Router } from 'express';
import { z } from 'zod';
import { routerService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import netwatchRoutes from './netwatch.routes.js';
import topologyRoutes from './topology.routes.js';
import { settingsService } from '../services/index.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
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
    gatewayId: z.string().uuid().optional().nullable(),
    romonMac: z.string().optional().nullable(),
});

const updateRouterSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    latitude: z.string().optional().nullable(),
    longitude: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    locationImage: z.string().url().optional().nullable(),
    groupId: z.string().uuid().optional().nullable(),
    notificationGroupId: z.string().uuid().optional().nullable(),
    notes: z.string().optional().nullable(),
    status: z.enum(['online', 'offline', 'maintenance', 'unknown']).optional(),
    snmpCommunity: z.string().optional(),
    snmpPort: z.number().int().min(1).max(65535).optional(),
    useGenieAcs: z.boolean().optional(),
    genieacsUrl: z.string().url().optional().nullable(),
    genieacsUsername: z.string().optional().nullable(),
    genieacsPassword: z.string().optional().nullable(),
    useWebhook: z.boolean().optional(),
    pollingIntervalMetrics: z.number().int().min(60).optional(),
    gatewayId: z.string().uuid().optional().nullable(),
    romonMac: z.string().optional().nullable(),
});

const testConnectionSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).optional().default(8728),
    username: z.string().min(1),
    password: z.string().min(1),
});

// All routes require authentication
router.use(authMiddleware);

// Sub-resource routers
router.use('/:id/netwatch', netwatchRoutes);
router.use('/:id/topology', topologyRoutes); // Maps to /api/routers/:id/topology
router.use('/topology', topologyRoutes);     // Maps to /api/routers/topology (coords, etc)

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
                tenantId = undefined;
            } else if (req.user?.role === 'admin') {
                const { userService } = await import('../services/user.service.js');
                tenantId = await userService.getAuthorizedTenants(req.user!.id);
            }
        }

        const routers = await routerService.findAll(tenantId, req.user?.id, req.user?.role);
        const sanitized = routers.map(({ passwordEncrypted, ...router }) => router);
        res.json({ data: sanitized });
    })
);

/**
 * GET /api/routers/netwatch-all
 */
router.get(
    '/netwatch-all',
    asyncHandler(async (req, res) => {
        const routers = await routerService.findAll(req.user?.tenantId!, req.user?.id, req.user?.role);
        const routerIds = routers.map(r => r.id);
        if (routerIds.length === 0) return res.json({ data: [] });
        const netwatch = await routerService.getNetwatchAll(routerIds);
        res.json({ data: netwatch });
    })
);

/**
 * GET /api/routers/:id
 */
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const router = await routerService.findById(id, getEffectiveTenantId(req));
        if (!router) throw ApiError.notFound('Router not found');
        const { passwordEncrypted, ...sanitized } = router;
        res.json({ data: sanitized });
    })
);

/**
 * POST /api/routers
 */
router.post(
    '/',
    requireOperator,
    asyncHandler(async (req, res) => {
        const data = createRouterSchema.parse(req.body);
        if (data.pollingIntervalMetrics !== 300 && req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
            throw ApiError.forbidden('Only administrators can set custom polling intervals');
        }

        let newRouter = await routerService.create(data, req.user?.tenantId!);
        await settingsService.logAction('create', 'router', newRouter.id, req.user!.id, req.user!.tenantId!, { name: newRouter.name, host: newRouter.host }, req);

        try {
            const refreshed = await routerService.refreshRouterStatus(newRouter.id, false, true, getEffectiveTenantId(req));
            if (refreshed) newRouter = refreshed;
        } catch (err: any) {
            logger.warn({ routerId: newRouter.id, err }, 'Initial refresh failed');
        }

        const { passwordEncrypted, ...sanitized } = newRouter;
        res.status(201).json({ data: sanitized });
    })
);

/**
 * PUT /api/routers/:id
 */
router.put(
    '/:id',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const data = updateRouterSchema.parse(req.body);
        if (data.pollingIntervalMetrics !== undefined && req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
            throw ApiError.forbidden('Only administrators can change polling intervals');
        }

        const updateData: any = { ...data };
        if (updateData.locationImage === null) updateData.locationImage = undefined;
        if (updateData.groupId === null) updateData.groupId = null;
        if (updateData.notificationGroupId === null) updateData.notificationGroupId = null;

        const router = await routerService.update(id, updateData, getEffectiveTenantId(req));
        if (!router) throw ApiError.notFound('Router not found');

        await settingsService.logAction('update', 'router', router.id, req.user!.id, req.user!.tenantId!, { changes: Object.keys(data) }, req);

        const { passwordEncrypted, ...sanitized } = router;
        res.json({ data: sanitized });
    })
);

/**
 * DELETE /api/routers/:id
 */
router.delete(
    '/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const router = await routerService.findById(id, getEffectiveTenantId(req));
        if (!router) throw ApiError.notFound('Router not found');
        const deleted = await routerService.delete(id, getEffectiveTenantId(req));
        if (!deleted) throw ApiError.internal('Failed to delete router');
        await settingsService.logAction('delete', 'router', id, req.user!.id, req.user!.tenantId!, { name: router.name }, req);
        res.json({ data: { message: 'Router deleted successfully' } });
    })
);

/**
 * Operations
 */
router.post('/:id/test-connection', requireOperator, asyncHandler(async (req, res) => {
    const result = await routerService.testConnection(req.params.id, getEffectiveTenantId(req));
    res.json({ data: result });
}));

router.post('/test-connection', requireOperator, asyncHandler(async (req, res) => {
    const data = testConnectionSchema.parse(req.body);
    const result = await routerService.testConnectionWithCredentials(data.host, data.port, data.username, data.password);
    res.json({ data: result });
}));

router.post('/:id/refresh', requireOperator, asyncHandler(async (req, res) => {
    const router = await routerService.refreshRouterStatus(req.params.id, false, true, getEffectiveTenantId(req));
    if (!router) throw ApiError.notFound('Router not found');
    const { passwordEncrypted, ...sanitized } = router;
    res.json({ data: sanitized });
}));

router.post('/:id/reboot', requireAdmin, asyncHandler(async (req, res) => {
    const router = await routerService.findById(req.params.id, getEffectiveTenantId(req));
    if (!router) throw ApiError.notFound('Router not found');
    const result = await routerService.reboot(req.params.id, getEffectiveTenantId(req));
    await settingsService.logAction('reboot', 'router', req.params.id, req.user!.id, req.user!.tenantId!, { name: router.name, success: result.success }, req);
    res.json({ data: result });
}));

/**
 * Metrics, Interfaces, etc.
 */
router.get('/:id/interfaces', asyncHandler(async (req, res) => {
    const interfaces = await routerService.getInterfaces(req.params.id, getEffectiveTenantId(req));
    res.json({ data: interfaces });
}));

router.get('/:id/interfaces/:interfaceId/history', asyncHandler(async (req, res) => {
    const { id, interfaceId } = req.params;
    const tenantId = getEffectiveTenantId(req);
    const routerData = await routerService.findById(id, tenantId);
    if (!routerData) throw new ApiError(404, 'Router not found or access denied');
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await routerService.getInterfaceHistory(interfaceId, limit, tenantId);
    res.json({ data: history });
}));

router.get('/:id/metrics', asyncHandler(async (req, res) => {
    const metrics = await routerService.getLatestMetrics(req.params.id, getEffectiveTenantId(req));
    res.json({ data: metrics });
}));

router.get('/:id/metrics/history', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const metrics = await routerService.getMetricsHistory(req.params.id, limit, getEffectiveTenantId(req));
    res.json({ data: metrics });
}));

router.get('/:id/ping-latencies', asyncHandler(async (req, res) => {
    const latencies = await routerService.measurePingTargets(req.params.id, getEffectiveTenantId(req));
    res.json({ data: latencies });
}));

router.get('/:id/neighbors', asyncHandler(async (req, res) => {
    const neighbors = await routerService.getNeighbors(req.params.id, getEffectiveTenantId(req));
    res.json({ data: neighbors });
}));

router.get('/:id/romon-neighbors', asyncHandler(async (req, res) => {
    const neighbors = await routerService.getRomonNeighbors(req.params.id, getEffectiveTenantId(req));
    res.json({ data: neighbors });
}));

router.get('/:id/hotspot/active', asyncHandler(async (req, res) => {
    const count = await routerService.getHotspotActive(req.params.id, getEffectiveTenantId(req));
    res.json({ data: { count } });
}));

router.get('/:id/ppp/active', asyncHandler(async (req, res) => {
    const count = await routerService.getPppActive(req.params.id, getEffectiveTenantId(req));
    res.json({ data: { count } });
}));

router.get('/:id/ppp/sessions', asyncHandler(async (req, res) => {
    const sessions = await routerService.getPppSessions(req.params.id, getEffectiveTenantId(req));
    res.json({ data: sessions });
}));

router.post('/:id/traffic/snmp', requireOperator, asyncHandler(async (req, res) => {
    const traffic = await routerService.getSnmpTraffic(req.params.id, getEffectiveTenantId(req));
    res.json({ data: traffic });
}));

export default router;
