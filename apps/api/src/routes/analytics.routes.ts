import { Router } from 'express';
import { analyticsService } from '../services/analytics.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

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
        const stats = await analyticsService.getOverviewStats(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
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
        const search = req.query.search as string;
        const trends = await analyticsService.getAlertTrends(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req), search);
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
        const resolved = req.query.resolved === 'true' ? true : (req.query.resolved === 'false' ? false : undefined);
        // @ts-ignore
        const alerts = await analyticsService.getAlertsList(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req), limit, resolved);
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
        const search = req.query.search as string;
        const stats = await analyticsService.getUptimeStats(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req), search);
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
        const trends = await analyticsService.getPerformanceTrends(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data: trends });
    })
);

/**
 * GET /api/analytics/performance/device
 * Get performance trends for a specific device (Latency/Signal)
 */
router.get(
    '/performance/device',
    asyncHandler(async (req, res) => {
        const { routerId, host, onuId, startDate, endDate } = req.query;

        if (!host && !onuId) {
            return res.status(400).json({ error: 'host or onuId is required' });
        }

        const data = await analyticsService.getDevicePerformanceTrends({
            routerId: routerId as string,
            host: host as string,
            onuId: onuId as string,
            startDate: startDate ? new Date(startDate as string) : new Date(Date.now() - 24 * 60 * 60 * 1000),
            endDate: endDate ? new Date(endDate as string) : new Date(),
            // @ts-ignore
            tenantId: getEffectiveTenantId(req)
        });

        res.json({ data });
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

        const result = await analyticsService.getAuditLogs(page, limit, dateRange, action, entity, getEffectiveTenantId(req));
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
        const devices = await analyticsService.getTopDownDevices(dateRange, limit, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data: devices });
    })
);

/**
 * GET /api/analytics/pppoe/top-disconnectors
 * Get PPPoE clients with most disconnections
 */
router.get(
    '/pppoe/top-disconnectors',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const limit = parseInt(req.query.limit as string) || 10;
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const data = await analyticsService.getTopPppoeDisconnectors(dateRange, limit, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data });
    })
);

/**
 * GET /api/analytics/pppoe/down-status
 * Get PPPoE clients that are currently down
 */
router.get(
    '/pppoe/down-status',
    asyncHandler(async (req, res) => {
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const data = await analyticsService.getCurrentPppoeDownStatus(routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data });
    })
);

/**
 * GET /api/analytics/issues
 * Get frequent issues analysis
 */
router.get(
    '/issues',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const limit = parseInt(req.query.limit as string) || 10;
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const data = await analyticsService.getIssuesAnalysis(dateRange, limit, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data });
    })
);

/**
 * GET /api/analytics/cpu-peaks
 * Get CPU peak analysis - routers with high CPU during peak hours
 */
router.get(
    '/cpu-peaks',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const data = await analyticsService.getCpuPeakAnalysis(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data });
    })
);

/**
 * GET /api/analytics/downtime
 * Get downtime analysis - devices with significant downtime
 */
router.get(
    '/downtime',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        const minMinutes = parseInt(req.query.minMinutes as string) || 5;
        // @ts-ignore
        const data = await analyticsService.getDowntimeAnalysis(dateRange, minMinutes, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data });
    })
);

/**
 * GET /api/analytics/capacity
 * Get interface capacity analysis - bottleneck detection
 */
router.get(
    '/capacity',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const data = await analyticsService.getInterfaceCapacityAnalysis(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data });
    })
);

/**
 * GET /api/analytics/incident-heatmap
 * Get incident heatmap data - geographic distribution
 */
router.get(
    '/incident-heatmap',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const data = await analyticsService.getIncidentHeatmap(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data });
    })
);

/**
 * GET /api/analytics/resolution
 * Get resolution statistics
 */
router.get(
    '/resolution',
    asyncHandler(async (req, res) => {
        const dateRange = parseDateRange(req.query);
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const stats = await analyticsService.getResolutionStats(dateRange, routerId, req.user?.id, req.user?.role, getEffectiveTenantId(req));
        res.json({ data: stats });
    })
);

export default router;

