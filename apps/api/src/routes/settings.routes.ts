import { Router } from 'express';
import { z } from 'zod';
import { settingsService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

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
    asyncHandler(async (req, res) => {
        const settings = await settingsService.findAllSettings(getEffectiveTenantId(req));

        // Redact sensitive settings
        const sanitized = settings.map(s => {
            if (s.key.includes('password') || s.key.includes('secret') || s.key.includes('encrypted')) {
                return { ...s, value: s.value ? '********' : null };
            }
            return s;
        });

        res.json({ data: sanitized });
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
        const key = req.params.key as string;
        const tenantId = getEffectiveTenantId(req);
        const setting = await settingsService.getSetting(key, tenantId as string);

        if (!setting) {
            throw ApiError.notFound('Setting not found');
        }

        // Redact sensitive settings
        if (key.includes('password') || key.includes('secret') || key.includes('encrypted')) {
            setting.value = setting.value ? '********' : null;
        }

        res.json({ data: setting });
    })
);

import { encrypt } from '../lib/encryption.js';

/**
 * PUT /api/settings/:key
 * Update or create setting
 * Requires: Admin
 */
router.put(
    '/:key',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const key = req.params.key as string;
        let { value, description } = updateSettingSchema.parse(req.body);

        // Encrypt special keys
        if (key === 'genieacs_password_encrypted' && typeof value === 'string' && value) {
            value = encrypt(value);
        }

        const setting = await settingsService.setSetting(key, value, (getEffectiveTenantId(req) || req.user!.tenantId) as string, description);

        // Check if scheduler restart is needed
        if (key.includes('interval')) {
            const { default: scheduler } = await import('../lib/scheduler.js');
            scheduler.restart();
        }

        // Log action
        await settingsService.logAction(
            'update',
            'settings',
            setting.id,
            req.user!.id,
            getEffectiveTenantId(req) ?? null,
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
        const key = req.params.key as string;
        const deleted = await settingsService.deleteSetting(key, (getEffectiveTenantId(req) || req.user!.tenantId) as string);

        if (!deleted) {
            throw ApiError.notFound('Setting not found');
        }

        res.json({ data: { message: 'Setting deleted successfully' } });
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
        const logs = await settingsService.getAuditLogs(getEffectiveTenantId(req), limit);

        res.json({ data: logs });
    })
);

export default router;
