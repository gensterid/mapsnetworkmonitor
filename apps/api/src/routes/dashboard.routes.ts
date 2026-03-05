import { Router } from 'express';
import { dashboardService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();
const getEffectiveTenantId = (req: any) => req.user?.role === 'superadmin' ? undefined : req.user?.tenantId!;

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
router.get(
    '/stats',
    asyncHandler(async (req, res) => {
        const stats = await dashboardService.getStats(getEffectiveTenantId(req), req.user?.id, req.user?.role);
        res.json({ data: stats });
    })
);

/**
 * GET /api/dashboard/map-data
 * Get map markers data for all routers
 */
router.get(
    '/map-data',
    asyncHandler(async (req, res) => {
        const markers = await dashboardService.getMapMarkers(getEffectiveTenantId(req), req.user?.id, req.user?.role);
        res.json({ data: markers });
    })
);

/**
 * GET /api/dashboard/recent-alerts
 * Get recent unacknowledged alerts
 */
router.get(
    '/recent-alerts',
    asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit as string) || 10;
        const alerts = await dashboardService.getRecentAlerts(limit, getEffectiveTenantId(req), req.user?.id, req.user?.role);
        res.json({ data: alerts });
    })
);

export default router;
