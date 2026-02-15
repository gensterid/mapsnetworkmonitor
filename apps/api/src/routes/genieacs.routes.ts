import { Router } from 'express';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { genieacsService } from '../services/genieacs.service.js';
import { routerService } from '../services/router.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

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
        const query = req.query.query ? JSON.parse(req.query.query as string) : {};
        const routerId = req.query.routerId as string | undefined;

        // Access Control
        if (req.user?.role !== 'admin') {
            if (!routerId) {
                // If no router specified, operator can only see devices from their assigned routers?
                // This is hard because GenieACS service needs a specific URL/Auth.
                // It usually defaults to global settings if routerId is missing.
                // We should probably BLOCK access if no routerId is provided for non-admins, 
                // unless we want to loop through all assigned routers (expensive).
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
        const { parameterName, value, type } = req.body;

        if (!parameterName || value === undefined) {
            throw ApiError.badRequest('parameterName and value are required');
        }

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
        const config = req.body;

        if (!config.wanType) {
            throw ApiError.badRequest('wanType is required');
        }

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
        const config = req.body;

        if (!config.ssidIndex) {
            // Default to 1 if not provided, or throw error? 
            // Better to default to 1.
            config.ssidIndex = 1;
        }

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
        const { deviceIds } = req.body;
        const routerId = req.query.routerId as string | undefined;

        if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
            throw ApiError.badRequest('deviceIds array is required');
        }

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
        const { deviceIds, type, config } = req.body;
        const routerId = req.query.routerId as string | undefined;

        if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
            throw ApiError.badRequest('deviceIds array is required');
        }
        if (!type || !['wan', 'wifi'].includes(type) || !config) {
            throw ApiError.badRequest('Valid type (wan/wifi) and config are required');
        }

        const result = await genieacsService.bulkPushConfig(deviceIds, type, config, routerId);
        res.json({ data: result });
    })
);

export default router;
