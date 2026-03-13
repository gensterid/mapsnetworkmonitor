import { Router } from 'express';
import { z } from 'zod';
import { routerService, topologyService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { settingsService } from '../services/index.js';
import { db } from '../db/index.js';
import { inArray } from 'drizzle-orm';
import { routerNetwatch } from '../db/schema/index.js';
import { logger } from '../lib/logger.js';

const router = Router();
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

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
        const router = await routerService.findById(id, getEffectiveTenantId(req));

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
            const refreshed = await routerService.refreshRouterStatus(newRouter.id, false, true, getEffectiveTenantId(req));
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

        const router = await routerService.update(id, updateData, getEffectiveTenantId(req));

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
        const router = await routerService.findById(id, getEffectiveTenantId(req));

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        const deleted = await routerService.delete(id, getEffectiveTenantId(req));

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

        res.json({ data: { message: 'Router deleted successfully' } });
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
        const result = await routerService.testConnection(id, getEffectiveTenantId(req));

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
        const router = await routerService.refreshRouterStatus(id, false, true, getEffectiveTenantId(req));

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
        const router = await routerService.findById(id, getEffectiveTenantId(req));

        if (!router) {
            throw ApiError.notFound('Router not found');
        }

        const result = await routerService.reboot(id, getEffectiveTenantId(req));

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
        const interfaces = await routerService.getInterfaces(id, getEffectiveTenantId(req));

        res.json({ data: interfaces });
    })
);

/**
 * GET /api/routers/:id/interfaces/:interfaceId/history
 * Get interface traffic history
 */
router.get(
    '/:id/interfaces/:interfaceId/history',
    asyncHandler(async (req, res) => {
        const { id, interfaceId } = req.params;
        const tenantId = getEffectiveTenantId(req);

        // Security check: Verify router exists and belongs to tenant
        const routerData = await routerService.findById(id as string, tenantId as string);
        if (!routerData) {
            throw new ApiError(404, 'Router not found or access denied');
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const history = await routerService.getInterfaceHistory(interfaceId as string, limit, tenantId as string);

        res.json({ data: history });
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
        const metrics = await routerService.getLatestMetrics(id, getEffectiveTenantId(req));

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
        const metrics = await routerService.getMetricsHistory(id, limit, getEffectiveTenantId(req));

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
        const latencies = await routerService.measurePingTargets(id, getEffectiveTenantId(req));
        res.json({ data: latencies });
    })
);

/**
 * GET /api/routers/:id/neighbors
 * Get discovered neighbors (MNDP)
 */
router.get(
    '/:id/neighbors',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const neighbors = await routerService.getNeighbors(id, getEffectiveTenantId(req));
        res.json({ data: neighbors });
    })
);

/**
 * GET /api/routers/:id/romon-neighbors
 * Get discovered RoMON neighbors
 */
router.get(
    '/:id/romon-neighbors',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const neighbors = await routerService.getRomonNeighbors(id, getEffectiveTenantId(req));
        res.json({ data: neighbors });
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
        const count = await routerService.getHotspotActive(id, getEffectiveTenantId(req));
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
        const count = await routerService.getPppActive(id, getEffectiveTenantId(req));
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
        const sessions = await routerService.getPppSessions(id, getEffectiveTenantId(req));
        res.json({ data: sessions });
    })
);
// ==================== NETWATCH ROUTES ====================

const createNetwatchSchema = z.object({
    host: z.string().optional(), // Optional for ODP devices
    name: z.string().optional(),
    interval: z.number().int().min(5).max(3600).optional().default(30),
    latitude: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().optional()),
    longitude: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().optional()),
    location: z.preprocess((val) => (val === null ? undefined : val), z.string().optional()),
    deviceType: z.enum(['client', 'olt', 'odp', 'router', 'switch']).optional(),
    waypoints: z.string().optional(),
    connectionType: z.enum(['router', 'client']).optional(),
    connectedToId: z.string().uuid().optional().nullable(),
    targetInterface: z.string().optional().nullable(),
    linkedOnuId: z.string().optional().nullable(),
    isAppOnly: z.boolean().optional(),
});

const updateNetwatchSchema = z.object({
    host: z.string().optional(), // Allow empty string for ODP
    name: z.string().optional(),
    interval: z.number().int().min(5).max(3600).optional(),
    latitude: z.string().optional().nullable(),
    longitude: z.string().optional().nullable(),
    location: z.string().nullable().optional(),
    status: z.enum(['up', 'down', 'unknown']).optional(),
    deviceType: z.enum(['client', 'olt', 'odp', 'router', 'switch']).optional(),
    waypoints: z.string().nullable().optional(),
    connectionType: z.enum(['router', 'client']).optional(),
    connectedToId: z.string().uuid().optional().nullable(),
    targetInterface: z.string().optional().nullable(),
    linkedOnuId: z.string().optional().nullable(),
    isAppOnly: z.boolean().optional(),
});

/**
 * GET /api/routers/:id/netwatch
 * Get all netwatch entries for a router
 */
router.get(
    '/:id/netwatch',
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

            const netwatch = await routerService.updateNetwatch(id_str, netwatchId_str, data, getEffectiveTenantId(req));

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
        const deleteFromMikrotik = req.query.deleteFromMikrotik !== 'false';
        const deleted = await routerService.deleteNetwatch(id, netwatchId, getEffectiveTenantId(req), deleteFromMikrotik);

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

        res.json({ data: { success: true } });
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
        const traffic = await routerService.getSnmpTraffic(id, getEffectiveTenantId(req));
        res.json({ data: traffic });
    })
);

// ==================== TOPOLOGY ROUTES ====================

/**
 * GET /api/routers/:id/topology
 * Get router topology nodes and edges
 */
router.get(
    '/:id/topology',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const topology = await topologyService.getRouterTopology(id);
        res.json({ data: topology });
    })
);

/**
 * PATCH /api/routers/topology/coords
 * Update node schematic coordinates
 */
router.patch(
    '/topology/coords',
    requireOperator,
    asyncHandler(async (req, res) => {
        const schema = z.object({
            routerId: z.string().uuid(),
            nodeId: z.string().uuid(),
            x: z.number(),
            y: z.number(),
        });
        const { routerId, nodeId, x, y } = schema.parse(req.body);
        await topologyService.updateCoords(routerId, nodeId, x, y, getEffectiveTenantId(req));
        res.json({ data: { success: true } });
    })
);

/**
 * POST /api/routers/:id/topology/nodes
 * Add a node to the schematic
 */
router.post(
    '/:id/topology/nodes',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const schema = z.object({
            nodeId: z.string().uuid().nullable().optional(),
            nodeType: z.string(),
            name: z.string().optional(),
            host: z.string().optional(),
        });
        const { nodeId, nodeType, name, host } = schema.parse(req.body);
        const node = await topologyService.addNode(
            id,
            nodeId || null,
            nodeType,
            getEffectiveTenantId(req),
            name || host ? { name, host } : undefined
        );
        res.json({ data: node });
    })
);

/**
 * DELETE /api/routers/:id/topology/nodes/:nodeId
 * Remove a node from the schematic
 */
router.delete(
    '/:id/topology/nodes/:nodeId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const nodeId = req.params.nodeId as string;
        await topologyService.removeNode(id, nodeId);
        res.json({ data: { success: true } });
    })
);

/**
 * PATCH /api/routers/topology/nodes/:nodeId
 */
router.patch(
    '/topology/nodes/:nodeId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const nodeId = req.params.nodeId as string;
        const schema = z.object({
            customName: z.string().optional().nullable(),
            customHost: z.string().optional().nullable(),
            nodeType: z.string().optional(),
            notes: z.string().optional().nullable(),
            routerId: z.string().uuid().optional(),
        });
        const data = schema.parse(req.body);
        const result = await topologyService.updateNode(nodeId, data as any);
        res.json({ data: result });
    })
);

/**
 * POST /api/routers/topology/links
 */
/**
 * POST /api/routers/topology/links
 * Add a link to the schematic
 */
router.post(
    '/topology/links',
    requireOperator,
    asyncHandler(async (req, res) => {
        const schema = z.object({
            routerId: z.string().uuid(),
            sourceNodeId: z.string(), // Allow string for fallback nodes (though usually it should be schematic ID)
            targetNodeId: z.string(),
            sourceInterface: z.string().optional().nullable(),
            targetInterface: z.string().optional().nullable(),
            pathOffset: z.string().or(z.number()).optional().nullable(),
            sourceHandle: z.string().optional().nullable(),
            targetHandle: z.string().optional().nullable(),
            notes: z.string().optional().nullable(),
        });
        const { routerId, sourceNodeId, targetNodeId, sourceInterface, targetInterface, pathOffset, sourceHandle, targetHandle, notes } = schema.parse(req.body);
        const link = await topologyService.addLink(
            routerId,
            sourceNodeId,
            targetNodeId,
            sourceInterface || '',
            targetInterface || '',
            getEffectiveTenantId(req),
            pathOffset ? String(pathOffset) : undefined,
            sourceHandle || undefined,
            targetHandle || undefined,
            notes || undefined
        );
        res.json({ data: link });
    })
);

/**
 * DELETE /api/routers/topology/links/:linkId
 */
router.delete(
    '/topology/links/:linkId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const linkId = req.params.linkId as string;
        await topologyService.removeLink(linkId);
        res.json({ data: { success: true } });
    })
);

/**
 * PATCH /api/routers/topology/links/:linkId
 */
router.patch(
    '/topology/links/:linkId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const linkId = req.params.linkId as string;
        const schema = z.object({
            sourceInterface: z.string().optional().nullable(),
            targetInterface: z.string().optional().nullable(),
            pathOffset: z.string().or(z.number()).optional().nullable(),
            animationType: z.string().optional().nullable(),
            sourceHandle: z.string().optional().nullable(),
            targetHandle: z.string().optional().nullable(),
            notes: z.string().optional().nullable(),
        });
        const data = schema.parse(req.body);
        await topologyService.updateLink(linkId, data as any);
        res.json({ data: { success: true } });
    })
);

/**
 * POST /api/routers/:id/ping
 * Ping an arbitrary IP from a router
 */
router.post(
    '/:id/ping',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const schema = z.object({
            ip: z.string().ip(),
        });
        const { ip } = schema.parse(req.body);

        const result = await routerService.pingHost(id, ip, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

export default router;

