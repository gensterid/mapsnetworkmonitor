import { Router } from 'express';
import { dashboardService } from '../services';
import { authMiddleware } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
router.get(
    '/stats',
    asyncHandler(async (req, res) => {
        const stats = await dashboardService.getStats();
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
        const markers = await dashboardService.getMapMarkers();
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
        const alerts = await dashboardService.getRecentAlerts(limit);
        res.json({ data: alerts });
    })
);

export default router;
