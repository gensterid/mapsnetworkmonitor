import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { genieacsService } from '../services/genieacs.service.js';
import { routerService } from '../services/router.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Validation schemas
const getDevicesSchema = z.object({
    query: z.string().optional().transform(val => val ? JSON.parse(val) : {}),
    routerId: z.string().optional(),
});

const setParameterSchema = z.object({
    parameterName: z.string().min(1),
    value: z.any(),
    type: z.string().optional(),
});

const wanConfigSchema = z.object({
    wanType: z.enum(['pppoe', 'ip']),
    pppoeUser: z.string().optional(),
    pppoePass: z.string().optional(),
    vlanId: z.number().optional(),
    ipAddress: z.string().optional(),
    subnetMask: z.string().optional(),
    gateway: z.string().optional(),
});

const wifiConfigSchema = z.object({
    ssidIndex: z.number().default(1),
    ssid: z.string().optional(),
    password: z.string().optional(),
    enabled: z.boolean().optional(),
});

const bulkActionSchema = z.object({
    deviceIds: z.array(z.string()).min(1),
});

const bulkConfigSchema = bulkActionSchema.extend({
    type: z.enum(['wan', 'wifi']),
    config: z.any(),
});

// Require auth for all routes
router.use(authMiddleware);

/**
 * GET /api/genieacs/devices
 * List all devices
 */
router.get(
    '/devices',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { query, routerId } = getDevicesSchema.parse(req.query);

        // Access Control
        if (req.user?.role !== 'admin') {
            if (!routerId) {
                throw ApiError.forbidden('Router ID is required for non-admins');
            }
            const hasAccess = await routerService.hasAccess(req.user!.id, req.user!.role, routerId);
            if (!hasAccess) {
                throw ApiError.forbidden('Access denied to this router');
            }
        }

        const devices = await genieacsService.getDevices(routerId, query);
        res.json({ data: devices });
    })
);

/**
 * GET /api/genieacs/devices/:id
 * Get device details
 */
router.get(
    '/devices/:id',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;

        // Access Control
        if (req.user?.role !== 'admin') {
            if (!routerId) throw ApiError.forbidden('Router ID is required for non-admins');
            const hasAccess = await routerService.hasAccess(req.user!.id, req.user!.role, routerId);
            if (!hasAccess) throw ApiError.forbidden('Access denied');
        }

        const device = await genieacsService.getDevice(id, routerId);
        if (!device) {
            throw ApiError.notFound('Device not found');
        }
        res.json({ data: device });
    })
);

/**
 * POST /api/genieacs/devices/:id/reboot
 * Reboot device
 */
router.post(
    '/devices/:id/reboot',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const result = await genieacsService.rebootDevice(id, routerId);
        res.json({ data: result });
    })
);

/**
 * PATCH /api/genieacs/devices/:id/parameters
 * Update device parameters
 */
router.patch(
    '/devices/:id/parameters',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const { parameterName, value, type } = setParameterSchema.parse(req.body);

        const result = await genieacsService.setParameter(id, parameterName, value, type, routerId);
        res.json({ data: result });
    })
);

/**
 * PATCH /api/genieacs/devices/:id/wan-config
 * Update device WAN configuration
 */
router.patch(
    '/devices/:id/wan-config',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const config = wanConfigSchema.parse(req.body);

        const result = await genieacsService.updateWanConfig(id, config, routerId);
        res.json({ data: result });
    })
);

/**
 * PATCH /api/genieacs/devices/:id/wifi-config
 * Update device WiFi configuration
 */
router.patch(
    '/devices/:id/wifi-config',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const config = wifiConfigSchema.parse(req.body);

        const result = await genieacsService.updateWifiConfig(id, config, routerId);
        res.json({ data: result });
    })
);

/**
 * POST /api/genieacs/devices/:id/refresh
 * Refresh device (Summon)
 */
router.post(
    '/devices/:id/refresh',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const result = await genieacsService.refreshDevice(id, routerId);
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: result.error });
        }
    })
);

/**
 * POST /api/genieacs/devices/:id/factory-reset
 * Factory Reset device
 */
router.post(
    '/devices/:id/factory-reset',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const result = await genieacsService.factoryReset(id, routerId);
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: result.error });
        }
    })
);

/**
 * POST /api/genieacs/devices/bulk/reboot
 * Bulk Reboot
 */
router.post(
    '/devices/bulk/reboot',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { deviceIds } = bulkActionSchema.parse(req.body);
        const routerId = req.query.routerId as string | undefined;

        const result = await genieacsService.bulkReboot(deviceIds, routerId);
        res.json({ data: result });
    })
);

/**
 * POST /api/genieacs/devices/bulk/config
 * Bulk Push Config
 */
router.post(
    '/devices/bulk/config',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { deviceIds, type, config } = bulkConfigSchema.parse(req.body);
        const routerId = req.query.routerId as string | undefined;

        const result = await genieacsService.bulkPushConfig(deviceIds, type, config, routerId);
        res.json({ data: result });
    })
);

export default router;
