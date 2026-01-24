import { Router } from 'express';
import { alertService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator, requireAdmin, requireUser } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/alerts
 * List all alerts
 */
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 100;
        const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';
        const search = req.query.search as string;
        const routerId = req.query.routerId as string;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const result = await alertService.findAll({
            page,
            limit,
            sortOrder,
            startDate,
            endDate,
            userId: req.user?.id,
            userRole: req.user?.role,
            search,
            routerId
        });

        res.json(result);
    })
);

/**
 * GET /api/alerts/unread
 * Get count of unacknowledged alerts
 */
router.get(
    '/unread',
    asyncHandler(async (req, res) => {
        const stats = await alertService.getUnreadStats(req.user?.id, req.user?.role);

        res.json({
            data: {
                count: stats.total, // Backward compatibility
                ...stats,
            },
        });
    })
);

/**
 * GET /api/alerts/unacknowledged
 * Get unacknowledged alerts
 */
router.get(
    '/unacknowledged',
    asyncHandler(async (req, res) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 100;
        const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const result = await alertService.findUnacknowledged({
            page,
            limit,
            sortOrder,
            startDate,
            endDate,
            userId: req.user?.id,
            userRole: req.user?.role
        });

        res.json(result);
    })
);

/**
 * GET /api/alerts/:id
 * Get alert by ID
 */
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const alert = await alertService.findById(id);

        if (!alert) {
            throw ApiError.notFound('Alert not found');
        }

        res.json({ data: alert });
    })
);

/**
 * PUT /api/alerts/:id/acknowledge
 * Acknowledge an alert
 * Requires: User, Operator or Admin
 */
router.put(
    '/:id/acknowledge',
    requireUser,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const alert = await alertService.acknowledge(id, req.user!.id, req.user!.role);

        if (!alert) {
            throw ApiError.notFound('Alert not found');
        }

        res.json({ data: alert });
    })
);

/**
 * PUT /api/alerts/acknowledge-all
 * Acknowledge all alerts
 * Requires: User, Operator or Admin
 */
router.put(
    '/acknowledge-all',
    requireUser,
    asyncHandler(async (req, res) => {
        await alertService.acknowledgeAll(req.user!.id, req.user!.role);
        res.json({ message: 'All alerts acknowledged successfully' });
    })
);

/**
 * PUT /api/alerts/:id/resolve
 * Resolve an alert
 * Requires: Operator or Admin
 */
router.put(
    '/:id/resolve',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const alert = await alertService.resolve(id);

        if (!alert) {
            throw ApiError.notFound('Alert not found');
        }

        res.json({ data: alert });
    })
);

/**
 * DELETE /api/alerts/:id
 * Delete an alert
 * Requires: Admin
 */
router.delete(
    '/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const deleted = await alertService.delete(id);

        if (!deleted) {
            throw ApiError.notFound('Alert not found');
        }

        res.json({ message: 'Alert deleted successfully' });
    })
);

export default router;
