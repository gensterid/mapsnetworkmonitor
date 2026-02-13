import { Router } from 'express';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { genieacsService } from '../services/genieacs.service.js';
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
        const devices = await genieacsService.getDevices();
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
        const device = await genieacsService.getDevice(id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
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
        const result = await genieacsService.rebootDevice(id);
        res.json({ data: result });
    })
);

export default router;
