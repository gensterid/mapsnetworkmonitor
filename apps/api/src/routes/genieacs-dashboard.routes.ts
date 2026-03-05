import { Router } from 'express';
import { genieacsService } from '../services/genieacs.service.js';
import { logger } from '../lib/logger.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { cacheService } from '../lib/cache.js';

const router = Router();

/**
 * Get ACS Dashboard Statistics
 */
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const routerId = req.query.routerId as string | undefined;
        const tenantId = getEffectiveTenantId(req);

        const stats = await genieacsService.getDashboardStats(routerId, tenantId);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error({ err: error }, 'ACS Stats Error');
        res.status(500).json({ success: false, message: 'Failed to fetch ACS statistics' });
    }
});

export default router;
