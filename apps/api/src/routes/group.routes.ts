import { Router } from 'express';
import { z } from 'zod';
import { groupService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin, requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
const getEffectiveTenantId = (req: any) => req.user?.role === 'superadmin' ? undefined : req.user?.tenantId!;

const router = Router();

// Validation schemas
const createGroupSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const updateGroupSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/groups
 * List all groups
 */
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const groups = await groupService.findAll(getEffectiveTenantId(req));
        res.json({ data: groups });
    })
);

/**
 * GET /api/groups/:id
 * Get group by ID
 */
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const group = await groupService.findById(id, getEffectiveTenantId(req));

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        res.json({ data: group });
    })
);

/**
 * POST /api/groups
 * Create a new group
 * Requires: Admin
 */
router.post(
    '/',
    requireOperator,
    asyncHandler(async (req, res) => {
        const data = createGroupSchema.parse(req.body);
        const group = await groupService.create(data, getEffectiveTenantId(req));

        res.status(201).json({ data: group });
    })
);

/**
 * PUT /api/groups/:id
 * Update group
 * Requires: Admin
 */
router.put(
    '/:id',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const data = updateGroupSchema.parse(req.body);

        const group = await groupService.update(id, data, getEffectiveTenantId(req));

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        res.json({ data: group });
    })
);

/**
 * DELETE /api/groups/:id
 * Delete group
 * Requires: Admin
 */
router.delete(
    '/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const deleted = await groupService.delete(id, getEffectiveTenantId(req));

        if (!deleted) {
            throw ApiError.notFound('Group not found');
        }

        res.json({ message: 'Group deleted successfully' });
    })
);

export default router;
