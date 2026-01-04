import { Router } from 'express';
import { alertService } from '../services';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireOperator, requireAdmin, requireUser } from '../middleware/rbac.middleware';
import { asyncHandler, ApiError } from '../middleware/error.middleware';

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
        const limit = parseInt(req.query.limit as string) || 100;
        const alerts = await alertService.findAll(limit, req.user?.id, req.user?.role);

        res.json({ data: alerts });
    })
);

/**
 * GET /api/alerts/unread
 * Get count of unacknowledged alerts
 */
router.get(
    '/unread',
    asyncHandler(async (req, res) => {
        const count = await alertService.countUnacknowledged(req.user?.id, req.user?.role);
        const bySeverity = await alertService.countBySeverity(req.user?.id, req.user?.role);

        res.json({
            data: {
                count,
                ...bySeverity,
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
        const limit = parseInt(req.query.limit as string) || 100;
        const alerts = await alertService.findUnacknowledged(limit, req.user?.id, req.user?.role);

        res.json({ data: alerts });
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
