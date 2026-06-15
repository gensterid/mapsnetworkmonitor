import { Router } from 'express';
import { z } from 'zod';
import { userService, settingsService } from '../services/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin, requireOwnerOrAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';

const router = Router();

// Validation schemas
// Helper to convert empty strings to null
const emptyToNull = (val: unknown) => (val === '' ? null : val);

const updateUserSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    username: z.preprocess(emptyToNull, z.string().min(3).max(50).optional().nullable()),
    image: z.preprocess(emptyToNull, z.string().url().optional().nullable()),
    timezone: z.string().optional(),
    animationStyle: z.string().optional(),
    aiEnabled: z.boolean().optional(),
    aiApiKey: z.preprocess(emptyToNull, z.string().optional().nullable()),
    tenantId: z.string().uuid().optional().nullable(),
    additionalTenantIds: z.array(z.string().uuid()).optional(),
});

const updateRoleSchema = z.object({
    role: z.enum(['superadmin', 'admin', 'operator', 'user']),
});

const updatePasswordSchema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

const createUserSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    username: z.string().min(3, 'Username must be at least 3 characters').max(50).optional(),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['superadmin', 'admin', 'operator', 'user']).optional().default('user'),
    tenantId: z.string().uuid().optional().nullable(),
    additionalTenantIds: z.array(z.string().uuid()).optional(),
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
    asyncHandler(async (req, res) => {
        // Superadmin sees everything (global view)
        // Others are strictly limited to their PRIMARY tenant context
        const isSuperadmin = req.user?.role === 'superadmin';

        // Strict Enforcement: Non-superadmins can only manage users in their Primary ISP
        if (!isSuperadmin && req.user?.tenantId !== req.user?.primaryTenantId) {
            return res.json({ data: [] });
        }

        const tenantId = isSuperadmin ? undefined : (req.user?.tenantId as string);

        // Safety check for non-superadmins
        if (!isSuperadmin && !tenantId) {
            return res.json({ data: [] });
        }

        const users = await userService.findAll(tenantId);
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

        // RBAC: Non-superadmins can only manage users in their Primary ISP
        if (req.user?.role !== 'superadmin' && req.user?.tenantId !== req.user?.primaryTenantId) {
            throw ApiError.forbidden('User management is only allowed in your primary ISP context');
        }

        // RBAC: Only superadmin can create superadmin
        if (data.role === 'superadmin' && req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only superadmins can create superadmin users');
        }

        // RBAC: Only superadmin can create admin
        if (data.role === 'admin' && req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only superadmins can create admin users');
        }

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
        const crypto = await import('crypto');
        const salt = crypto.randomBytes(16).toString('hex');
        const hashedBuffer = crypto.scryptSync(data.password, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
        const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

        // Use transaction to ensure user + account are created atomically
        const { db } = await import('../db/index.js');
        const { users, accounts } = await import('../db/schema/index.js');

        const user = await db.transaction(async (tx) => {
            // Create user
            const [newUser] = await tx.insert(users).values({
                id: crypto.randomUUID(),
                name: data.name,
                username: data.username || null,
                email: data.email,
                emailVerified: true, // Admin-created users are auto-verified
                role: data.role || 'user',
                tenantId: data.tenantId || req.user?.tenantId || null,
                createdAt: new Date(),
                updatedAt: new Date(),
            }).returning();

            // Create the credential account for authentication
            await tx.insert(accounts).values({
                id: crypto.randomUUID(),
                accountId: newUser.id,
                providerId: 'credential',
                userId: newUser.id,
                password: hashedPassword,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Handle additional tenants
            if (data.additionalTenantIds && data.additionalTenantIds.length > 0) {
                const { userTenants } = await import('../db/schema/index.js');
                await tx.insert(userTenants).values(
                    data.additionalTenantIds.map(tId => ({ userId: newUser.id, tenantId: tId }))
                );
            }

            return newUser;
        });

        // Log action
        await settingsService.logAction(
            'create',
            'user',
            user.id,
            req.user!.id,
            req.user?.tenantId || null,
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
    requireOwnerOrAdmin((req) => req.params.id as string),
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const isSuperadmin = req.user?.role === 'superadmin';

        // Strict Enforcement: Non-superadmins can only manage users in their Primary ISP
        if (!isSuperadmin && req.user?.tenantId !== req.user?.primaryTenantId) {
            throw ApiError.forbidden('User management is only allowed in your primary ISP context');
        }

        const tenantId = isSuperadmin ? undefined : (req.user?.tenantId as string);

        const user = await userService.findById(id, tenantId);

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
    requireOwnerOrAdmin((req) => req.params.id as string),
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;

        // Strict Enforcement: Non-superadmins can only manage users in their Primary ISP
        if (req.user?.role !== 'superadmin' && req.user?.tenantId !== req.user?.primaryTenantId) {
            throw ApiError.forbidden('User management is only allowed in your primary ISP context');
        }

        const { additionalTenantIds, ...userData } = updateUserSchema.parse(req.body);

        // RBAC: Only superadmin can change the primary tenantId
        if (userData.tenantId !== undefined && req.user?.role !== 'superadmin') {
            const currentUser = await userService.findById(id);
            if (currentUser && currentUser.tenantId !== userData.tenantId) {
                throw ApiError.forbidden('Only superadmins can change the primary ISP assignment');
            }
        }

        // Fetch target user for target protection
        const targetUser = await userService.findById(id);
        if (!targetUser) {
            throw ApiError.notFound('User not found');
        }

        // RBAC: Admin cannot modify another admin
        if (targetUser.role === 'admin' && req.user?.role === 'admin' && id !== req.user?.id) {
            throw ApiError.forbidden('Admins cannot modify other admins');
        }

        // RBAC: Admin cannot modify a superadmin
        if (targetUser.role === 'superadmin' && req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only superadmins can modify other superadmins');
        }

        const user = await userService.update(id, userData);

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        // Invalidate billing TZ cache kalau timezone berubah — supaya billing
        // helpers fetch fresh value tanpa nunggu TTL 5 menit. Hanya user yang
        // affect tenant timezone cache yang perlu invalidate (user di tenant
        // yang sama).
        if (userData.timezone !== undefined && (user.tenantId || targetUser.tenantId)) {
            try {
                const { invalidateTenantBillingTimezone } = await import('../services/billing/billing-helpers.js');
                const tid = (user.tenantId || targetUser.tenantId) as string;
                invalidateTenantBillingTimezone(tid);
            } catch { /* non-fatal */ }
        }

        // Handle additional tenants (Superadmin only)
        if (additionalTenantIds !== undefined && req.user?.role === 'superadmin') {
            await userService.updateTenantAccesses(id, additionalTenantIds);
        }

        // Log action
        await settingsService.logAction(
            'update',
            'user',
            id,
            req.user!.id,
            req.user?.tenantId || null,
            { changes: Object.keys(userData) },
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
        const id = req.params.id as string;

        // Strict Enforcement: Non-superadmins can only manage users in their Primary ISP
        if (req.user?.role !== 'superadmin' && req.user?.tenantId !== req.user?.primaryTenantId) {
            throw ApiError.forbidden('User management is only allowed in your primary ISP context');
        }

        const { role } = updateRoleSchema.parse(req.body);

        // Fetch target user to check their current role
        const targetUser = await userService.findById(id);
        if (!targetUser) {
            throw ApiError.notFound('User not found');
        }

        // RBAC: Admin cannot modify another admin's role
        if (targetUser.role === 'admin' && req.user?.role === 'admin' && id !== req.user?.id) {
            throw ApiError.forbidden('Admins cannot change roles of other admins');
        }

        // RBAC: Non-superadmin cannot modify a superadmin
        if (targetUser.role === 'superadmin' && req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only superadmins can modify other superadmins');
        }

        // RBAC: Only superadmin can promote to superadmin
        if (role === 'superadmin' && req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only superadmins can promote users to superadmin');
        }

        // RBAC: Only superadmin can promote to admin
        if (role === 'admin' && req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only superadmins can promote users to admin');
        }

        // Prevent admin from changing their own role
        if (id === req.user!.id) {
            throw ApiError.badRequest('Cannot change your own role');
        }

        const user = await userService.updateRole(id, role as any);

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        // Log action
        await settingsService.logAction(
            'update_role',
            'user',
            id,
            req.user!.id,
            req.user?.tenantId || null,
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
        const id = req.params.id as string;

        // Strict Enforcement: Non-superadmins can only manage users in their Primary ISP
        if (req.user?.role !== 'superadmin' && req.user?.tenantId !== req.user?.primaryTenantId) {
            throw ApiError.forbidden('User management is only allowed in your primary ISP context');
        }

        const { password } = updatePasswordSchema.parse(req.body);

        // Fetch target user
        const targetUser = await userService.findById(id);
        if (!targetUser) {
            throw ApiError.notFound('User not found');
        }

        // RBAC: Non-superadmin cannot modify a superadmin's password
        if (targetUser.role === 'superadmin' && req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only superadmins can change other superadmin passwords');
        }

        // RBAC: Admin cannot modify another admin's password
        if (targetUser.role === 'admin' && req.user?.role === 'admin' && id !== req.user?.id) {
            throw ApiError.forbidden('Admins cannot change passwords of other admins');
        }

        // Allow admin/superadmin to change any password (including their own)
        // via this management endpoint.

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
            req.user?.tenantId || null,
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
        const id = req.params.id as string;

        // Strict Enforcement: Non-superadmins can only manage users in their Primary ISP
        if (req.user?.role !== 'superadmin' && req.user?.tenantId !== req.user?.primaryTenantId) {
            throw ApiError.forbidden('User management is only allowed in your primary ISP context');
        }

        // Prevent admin from deleting themselves
        if (id === req.user!.id) {
            throw ApiError.badRequest('Cannot delete your own account');
        }

        const user = await userService.findById(id);

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        // RBAC: Non-superadmin cannot delete a superadmin
        if (user.role === 'superadmin' && req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only superadmins can delete other superadmins');
        }

        // RBAC: Admin cannot delete another admin
        if (user.role === 'admin' && req.user?.role === 'admin' && id !== req.user?.id) {
            throw ApiError.forbidden('Admins cannot delete other admins');
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
            req.user?.tenantId || null,
            { email: user.email },
            req
        );

        res.json({ data: { message: 'User deleted successfully' } });
    })
);

export default router;
