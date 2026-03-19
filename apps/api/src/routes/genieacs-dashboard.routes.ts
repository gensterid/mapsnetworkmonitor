import { Router } from 'express';
import { genieacsService } from '../services/genieacs.service.js';
import { logger } from '../lib/logger.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

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
    } catch (error: any) {
        logger.error({ err: error }, 'ACS Stats Error');
        if (error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH') {
            res.status(503).json({ success: false, message: 'GenieACS Server is unreachable. Please check your network configuration in Proxmox.' });
            return;
        }
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            res.status(504).json({ success: false, message: 'GenieACS request timed out.' });
            return;
        }
        res.status(500).json({ success: false, message: 'Failed to fetch ACS statistics' });
    }
});

export default router;
