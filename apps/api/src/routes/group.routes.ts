import { Router } from 'express';
import { z } from 'zod';
import { groupService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';

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
    asyncHandler(async (_req, res) => {
        const groups = await groupService.findAll();
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
        const { id } = req.params;
        const group = await groupService.findById(id);

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
    requireAdmin,
    asyncHandler(async (req, res) => {
        const data = createGroupSchema.parse(req.body);
        const group = await groupService.create(data);

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
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const data = updateGroupSchema.parse(req.body);

        const group = await groupService.update(id, data);

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
        const { id } = req.params;
        const deleted = await groupService.delete(id);

        if (!deleted) {
            throw ApiError.notFound('Group not found');
        }

        res.json({ message: 'Group deleted successfully' });
    })
);

export default router;
