import { Router } from 'express';
import { analyticsService } from '../services/analytics.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

// All analytics routes require authentication and operator role (or admin)
router.use(authMiddleware);
router.use(requireOperator);

/**
 * Parse date range from query parameters
 */
function parseDateRange(query: any): { startDate: Date; endDate: Date } | undefined {
    if (query.startDate && query.endDate) {
        return {
            startDate: new Date(query.startDate),
            endDate: new Date(query.endDate),
        };
    }
    return undefined;
}

/**
 * GET /api/analytics/overview
 * Get overview statistics
 */
router.get(
    '/overview',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore - user is attached by authMiddleware
        const stats = await analyticsService.getOverviewStats(dateRange, routerId, req.user?.id, req.user?.role);
        res.json({ data: stats });
    })
);

/**
 * GET /api/analytics/alerts/trends
 * Get alert trends by day
 */
router.get(
    '/alerts/trends',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const trends = await analyticsService.getAlertTrends(dateRange, routerId, req.user?.id, req.user?.role);
        res.json({ data: trends });
    })
);

/**
 * GET /api/analytics/alerts/list
 * Get detailed alerts list
 */
router.get(
    '/alerts/list',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        const limit = parseInt(req.query.limit as string) || 50;
        // @ts-ignore
        const alerts = await analyticsService.getAlertsList(dateRange, routerId, req.user?.id, req.user?.role, limit);
        res.json({ data: alerts });
    })
);

/**
 * GET /api/analytics/uptime
 * Get uptime statistics per router
 */
router.get(
    '/uptime',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const stats = await analyticsService.getUptimeStats(dateRange, routerId, req.user?.id, req.user?.role);
        res.json({ data: stats });
    })
);

/**
 * GET /api/analytics/performance
 * Get performance trends (CPU/Memory)
 */
router.get(
    '/performance',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const trends = await analyticsService.getPerformanceTrends(dateRange, routerId, req.user?.id, req.user?.role);
        res.json({ data: trends });
    })
);

/**
 * GET /api/analytics/audit-logs
 * Get audit logs with pagination
 */
router.get(
    '/audit-logs',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const action = req.query.action as string | undefined;
        const entity = req.query.entity as string | undefined;

        const result = await analyticsService.getAuditLogs(page, limit, dateRange, action, entity);
        res.json({ data: result });
    })
);

/**
 * GET /api/analytics/top-down-devices
 * Get devices with most down incidents
 */
router.get(
    '/top-down-devices',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const limit = parseInt(req.query.limit as string) || 10;
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const devices = await analyticsService.getTopDownDevices(dateRange, limit, routerId, req.user?.id, req.user?.role);
        res.json({ data: devices });
    })
);

export default router;
