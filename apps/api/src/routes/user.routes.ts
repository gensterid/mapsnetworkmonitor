import { Router } from 'express';
import { z } from 'zod';
import { userService, settingsService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin, requireOwnerOrAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';

const router = Router();

// Validation schemas
const updateUserSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    username: z.string().min(3).max(50).optional().nullable(),
    image: z.string().url().optional().nullable(),
    timezone: z.string().optional(),
    animationStyle: z.string().optional(),
});

const updateRoleSchema = z.object({
    role: z.enum(['admin', 'operator', 'user']),
});

const updatePasswordSchema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

const createUserSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    username: z.string().min(3, 'Username must be at least 3 characters').max(50).optional(),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['admin', 'operator', 'user']).optional().default('user'),
});

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/users
 * List all users
 * Requires: Admin
 */
router.get(
    '/',
    requireAdmin,
    asyncHandler(async (_req, res) => {
        const users = await userService.findAll();
        res.json({ data: users });
    })
);

/**
 * POST /api/users
 * Create a new user
 * Requires: Admin
 */
router.post(
    '/',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const data = createUserSchema.parse(req.body);

        // Check if email already exists
        const existingUser = await userService.findByEmail(data.email);
        if (existingUser) {
            throw ApiError.badRequest('Email already in use');
        }

        // Check if username already exists (if provided)
        if (data.username) {
            const existingUsername = await userService.findByUsername(data.username);
            if (existingUsername) {
                throw ApiError.badRequest('Username already in use');
            }
        }

        // Hash password using scrypt (same as Better Auth)
        // Better Auth uses this format: hashedPassword:salt
        const crypto = await import('crypto');
        const salt = crypto.randomBytes(16).toString('hex');
        const hashedBuffer = crypto.scryptSync(data.password, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
        const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

        const user = await userService.create({
            id: crypto.randomUUID(),
            name: data.name,
            username: data.username || null,
            email: data.email,
            emailVerified: true, // Admin-created users are auto-verified
            role: data.role || 'user',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Create the credential account for authentication
        const { db } = await import('../db/index.js');
        const { accounts } = await import('../db/schema/index.js');
        await db.insert(accounts).values({
            id: crypto.randomUUID(),
            accountId: user.id,
            providerId: 'credential',
            userId: user.id,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Log action
        await settingsService.logAction(
            'create',
            'user',
            user.id,
            req.user!.id,
            { email: data.email, role: data.role },
            req
        );

        res.status(201).json({ data: user });
    })
);

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get(
    '/me',
    asyncHandler(async (req, res) => {
        const user = await userService.findById(req.user!.id);

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        res.json({ data: user });
    })
);

/**
 * GET /api/users/:id
 * Get user by ID
 * Requires: Admin or Self
 */
router.get(
    '/:id',
    requireOwnerOrAdmin((req) => req.params.id),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const user = await userService.findById(id);

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        res.json({ data: user });
    })
);

/**
 * PUT /api/users/:id
 * Update user
 * Requires: Admin or Self
 */
router.put(
    '/:id',
    requireOwnerOrAdmin((req) => req.params.id),
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const data = updateUserSchema.parse(req.body);

        const user = await userService.update(id, data);

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        // Log action
        await settingsService.logAction(
            'update',
            'user',
            id,
            req.user!.id,
            { changes: Object.keys(data) },
            req
        );

        res.json({ data: user });
    })
);

/**
 * PUT /api/users/:id/role
 * Update user role
 * Requires: Admin
 */
router.put(
    '/:id/role',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { role } = updateRoleSchema.parse(req.body);

        // Prevent admin from changing their own role
        if (id === req.user!.id) {
            throw ApiError.badRequest('Cannot change your own role');
        }

        const user = await userService.updateRole(id, role);

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        // Log action
        await settingsService.logAction(
            'update_role',
            'user',
            id,
            req.user!.id,
            { newRole: role },
            req
        );

        res.json({ data: user });
    })
);

/**
 * PUT /api/users/:id/password
 * Update user password (admin only)
 * Requires: Admin
 */
router.put(
    '/:id/password',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { password } = updatePasswordSchema.parse(req.body);

        // Prevent admin from changing their own password via this endpoint
        if (id === req.user!.id) {
            throw ApiError.badRequest('Use profile settings to change your own password');
        }

        const success = await userService.updatePassword(id, password);

        if (!success) {
            throw ApiError.notFound('User not found or password could not be updated');
        }

        // Log action
        await settingsService.logAction(
            'update_password',
            'user',
            id,
            req.user!.id,
            {},
            req
        );

        res.json({ data: { success: true, message: 'Password updated successfully' } });
    })
);

/**
 * DELETE /api/users/:id
 * Delete user
 * Requires: Admin
 */
router.delete(
    '/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        // Prevent admin from deleting themselves
        if (id === req.user!.id) {
            throw ApiError.badRequest('Cannot delete your own account');
        }

        const user = await userService.findById(id);

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        const deleted = await userService.delete(id);

        if (!deleted) {
            throw ApiError.internal('Failed to delete user');
        }

        // Log action
        await settingsService.logAction(
            'delete',
            'user',
            id,
            req.user!.id,
            { email: user.email },
            req
        );

        res.json({ message: 'User deleted successfully' });
    })
);

export default router;
