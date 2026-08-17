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
import { strictLimiter } from '../config/security.js';

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
    snmpHost: z.string().optional().nullable(),
    useSnmp: z.boolean().optional().default(true),
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
    snmpHost: z.string().optional().nullable(),
    useSnmp: z.boolean().optional(),
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
        const role = req.user?.role;
        let router;
        if (role === 'operator' || role === 'user') {
            // Operator lintas-ISP: gate via hasAccess (cek assignment + ISP yang
            // boleh diakses), lalu ambil tanpa scope tenant primer (akses sudah
            // diverifikasi) — agar router yang di-assign di ISP lain tetap terbuka.
            const ok = await routerService.hasAccess(req.user!.id, role, id, getEffectiveTenantId(req));
            if (!ok) throw ApiError.notFound('Router not found');
            router = await routerService.findById(id);
        } else {
            router = await routerService.findById(id, getEffectiveTenantId(req));
        }
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
    strictLimiter,
    requireOperator,
    asyncHandler(async (req, res) => {
        const data = createRouterSchema.parse(req.body);
        if (data.pollingIntervalMetrics !== 300 && req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
            throw ApiError.forbidden('Only administrators can set custom polling intervals');
        }

        let newRouter = await routerService.create(data, req.user?.tenantId!);
        await settingsService.logAction('create', 'router', newRouter.id, req.user!.id, req.user!.tenantId!, { name: newRouter.name, host: newRouter.host }, req);

        try {
            const refreshed = await routerService.refreshRouterStatus(newRouter.id, false, true, getEffectiveTenantId(req), true);
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
    strictLimiter,
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

        // Immediately trigger status refresh after update to clear errors and update UI
        try {
            await routerService.refreshRouterStatus(id, false, true, getEffectiveTenantId(req), true);
        } catch (err: any) {
            logger.warn({ routerId: id, err }, 'Refresh after update failed');
        }

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
    strictLimiter,
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
router.post('/:id/test-connection', strictLimiter, requireOperator, asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const result = await routerService.testConnection(id, getEffectiveTenantId(req));
    res.json({ data: result });
}));

router.post('/test-connection', strictLimiter, requireOperator, asyncHandler(async (req, res) => {
    const data = testConnectionSchema.parse(req.body);
    const result = await routerService.testConnectionWithCredentials(data.host, data.port, data.username, data.password);
    res.json({ data: result });
}));

router.post('/:id/refresh', requireOperator, asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const router = await routerService.refreshRouterStatus(id, false, true, getEffectiveTenantId(req), true);
    if (!router) throw ApiError.notFound('Router not found');
    const { passwordEncrypted, ...sanitized } = router;
    res.json({ data: sanitized });
}));

router.post('/:id/reboot', strictLimiter, requireAdmin, asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const router = await routerService.findById(id, getEffectiveTenantId(req));
    if (!router) throw ApiError.notFound('Router not found');
    const result = await routerService.reboot(id, getEffectiveTenantId(req));
    await settingsService.logAction('reboot', 'router', id, req.user!.id, req.user!.tenantId!, { name: router.name, success: result.success }, req);
    res.json({ data: result });
}));

/**
 * Metrics, Interfaces, etc.
 */
router.get('/:id/interfaces', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const interfaces = await routerService.getInterfaces(id, getEffectiveTenantId(req));
    res.json({ data: interfaces });
}));

router.get('/:id/interfaces/:interfaceId/history', asyncHandler(async (req, res) => {
    const { id, interfaceId } = req.params as { id: string; interfaceId: string };
    const tenantId = getEffectiveTenantId(req);
    const routerData = await routerService.findById(id, tenantId);
    if (!routerData) throw new ApiError(404, 'Router not found or access denied');
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await routerService.getInterfaceHistory(interfaceId, limit, tenantId);
    res.json({ data: history });
}));

router.get('/:id/metrics', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const metrics = await routerService.getLatestMetrics(id, getEffectiveTenantId(req));
    res.json({ data: metrics });
}));

router.get('/:id/metrics/history', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const limit = parseInt(req.query.limit as string) || 100;
    const metrics = await routerService.getMetricsHistory(id, limit, getEffectiveTenantId(req));
    res.json({ data: metrics });
}));

router.get('/:id/ping-latencies', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const latencies = await routerService.measurePingTargets(id, getEffectiveTenantId(req));
    res.json({ data: latencies });
}));

router.get('/:id/neighbors', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const neighbors = await routerService.getNeighbors(id, getEffectiveTenantId(req));
    res.json({ data: neighbors });
}));

router.get('/:id/romon-neighbors', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const neighbors = await routerService.getRomonNeighbors(id, getEffectiveTenantId(req));
    res.json({ data: neighbors });
}));

router.get('/:id/hotspot/active', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const count = await routerService.getHotspotActive(id, getEffectiveTenantId(req));
    res.json({ data: { count } });
}));

router.get('/:id/ppp/active', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const count = await routerService.getPppActive(id, getEffectiveTenantId(req));
    res.json({ data: { count } });
}));

router.get('/:id/ppp/sessions', asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const sessions = await routerService.getPppSessions(id, getEffectiveTenantId(req));
    res.json({ data: sessions });
}));

router.post('/:id/traffic/snmp', requireOperator, asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const traffic = await routerService.getSnmpTraffic(id, getEffectiveTenantId(req));
    res.json({ data: traffic });
}));

// ─── Network Tools ────────────────────────────────────────────────────────────

const BLOCKED_HOSTS = /^(localhost|127\.|0\.0\.0\.0|169\.254\.|::1|0:0:0:0:0:0:0:1)$/i;
const VALID_HOST_RE = /^[a-zA-Z0-9.\-_]+$/;

function validateToolHost(host: string) {
    if (!host || !VALID_HOST_RE.test(host) || BLOCKED_HOSTS.test(host)) {
        throw new ApiError(400, 'Invalid or blocked host');
    }
}

const pingToolSchema = z.object({
    host: z.string().min(1).max(253),
    count: z.number().int().min(1).max(10).optional().default(4),
});

const tracerouteToolSchema = z.object({
    host: z.string().min(1).max(253),
    maxHops: z.number().int().min(1).max(30).optional().default(20),
});

const portCheckSchema = z.object({
    host: z.string().min(1).max(253),
    port: z.number().int().min(1).max(65535),
});

/**
 * POST /api/routers/:id/tools/ping
 */
router.post('/:id/tools/ping', requireOperator, strictLimiter, asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { host, count } = pingToolSchema.parse(req.body);
    validateToolHost(host);
    const result = await routerService.pingHost(id, host, getEffectiveTenantId(req));
    res.json({ data: { host, latency: result.latency, packetLoss: result.packetLoss, success: result.packetLoss !== 100 } });
}));

/**
 * POST /api/routers/:id/tools/traceroute
 */
router.post('/:id/tools/traceroute', requireOperator, strictLimiter, asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { host, maxHops } = tracerouteToolSchema.parse(req.body);
    validateToolHost(host);
    const result = await routerService.tracerouteHost(id, host, getEffectiveTenantId(req), maxHops);
    res.json({ data: result });
}));

/**
 * POST /api/routers/:id/tools/port-check
 * Runs from the API server (VPN-connected), not from MikroTik.
 */
router.post('/:id/tools/port-check', requireOperator, strictLimiter, asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { host, port } = portCheckSchema.parse(req.body);
    validateToolHost(host);

    // Verify router exists and tenant matches
    await routerService.findById(id, getEffectiveTenantId(req));

    const { createConnection } = await import('net');
    const start = Date.now();
    const open = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host, port, timeout: 5000 }, () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
    const latency = Date.now() - start;

    res.json({ data: { host, port, open, latency: open ? latency : null } });
}));

export default router;
