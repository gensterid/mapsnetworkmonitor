import { Router } from 'express';
import { z } from 'zod';
import { settingsService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';

const router = Router();

// Validation schemas
const updateSettingSchema = z.object({
    value: z.unknown(),
    description: z.string().optional(),
});

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/settings
 * Get all settings
 * Requires: Authenticated
 */
router.get(
    '/',
    asyncHandler(async (_req, res) => {
        const settings = await settingsService.findAllSettings();
        res.json({ data: settings });
    })
);

/**
 * GET /api/settings/:key
 * Get setting by key
 * Requires: Authenticated
 */
router.get(
    '/:key',
    asyncHandler(async (req, res) => {
        const { key } = req.params;
        const setting = await settingsService.getSetting(key);

        if (!setting) {
            throw ApiError.notFound('Setting not found');
        }

        res.json({ data: setting });
    })
);

/**
 * PUT /api/settings/:key
 * Update or create setting
 * Requires: Admin
 */
router.put(
    '/:key',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { key } = req.params;
        const { value, description } = updateSettingSchema.parse(req.body);

        const setting = await settingsService.setSetting(key, value, description);

        // Log action
        await settingsService.logAction(
            'update',
            'settings',
            setting.id,
            req.user!.id,
            { key },
            req
        );

        res.json({ data: setting });
    })
);

/**
 * DELETE /api/settings/:key
 * Delete setting
 * Requires: Admin
 */
router.delete(
    '/:key',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { key } = req.params;
        const deleted = await settingsService.deleteSetting(key);

        if (!deleted) {
            throw ApiError.notFound('Setting not found');
        }

        res.json({ message: 'Setting deleted successfully' });
    })
);

/**
 * GET /api/audit-logs
 * Get audit logs
 * Requires: Admin
 */
router.get(
    '/audit-logs',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit as string) || 100;
        const logs = await settingsService.getAuditLogs(limit);

        res.json({ data: logs });
    })
);

export default router;
