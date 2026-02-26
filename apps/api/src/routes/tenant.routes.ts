import { Router } from 'express';
import { z } from 'zod';
import { tenantService } from '../services/tenant.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';

const router = Router();

// Validation schemas
const tenantSchema = z.object({
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(50),
    description: z.string().optional(),
    settings: z.string().optional(),
});

// Basic access requires authentication
router.use(authMiddleware);

/**
 * GET /api/tenants
 * List all tenants (Filtered by role)
 */
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const userRole = req.user?.role;
        const tenantId = req.user?.tenantId;

        if (userRole === 'superadmin') {
            const tenants = await tenantService.findAll();
            return res.json({ data: tenants });
        }

        // Admins, Operators, and Users only see their own tenant
        if (tenantId) {
            const tenant = await tenantService.findById(tenantId);
            return res.json({ data: tenant ? [tenant] : [] });
        }

        res.json({ data: [] });
    })
);

/**
 * GET /api/tenants/:id
 * Get tenant by ID
 */
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const userRole = req.user?.role;
        const userTenantId = req.user?.tenantId;

        // Enforce isolation: Non-superadmins only access their own tenant
        if (userRole !== 'superadmin' && userTenantId !== id) {
            throw ApiError.forbidden('You do not have access to this tenant');
        }

        const tenant = await tenantService.findById(id);
        if (!tenant) throw ApiError.notFound('Tenant not found');
        res.json({ data: tenant });
    })
);

/**
 * POST /api/tenants
 * Create a new tenant (Super Admin only)
 */
router.post(
    '/',
    requireAdmin, // Initially requireAdmin, but usually creating tenants is for Super Admins
    asyncHandler(async (req, res) => {
        if (req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only Super Admins can create tenants');
        }

        const data = tenantSchema.parse(req.body);
        const newTenant = await tenantService.create(data);
        res.status(201).json({ data: newTenant });
    })
);

/**
 * PUT /api/tenants/:id
 * Update a tenant
 */
router.put(
    '/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const userRole = req.user?.role;
        const userTenantId = req.user?.tenantId;

        // Enforce isolation
        if (userRole !== 'superadmin' && userTenantId !== id) {
            throw ApiError.forbidden('You can only update your own tenant');
        }

        const data = tenantSchema.partial().parse(req.body);
        const updatedTenant = await tenantService.update(id, data);
        if (!updatedTenant) throw ApiError.notFound('Tenant not found');
        res.json({ data: updatedTenant });
    })
);

/**
 * DELETE /api/tenants/:id
 * Delete a tenant (Super Admin only)
 */
router.delete(
    '/:id',
    requireAdmin,
    asyncHandler(async (req, res) => {
        if (req.user?.role !== 'superadmin') {
            throw ApiError.forbidden('Only Super Admins can delete tenants');
        }

        const success = await tenantService.delete(req.params.id);
        if (!success) throw ApiError.notFound('Tenant not found');
        res.json({ message: 'Tenant deleted successfully' });
    })
);

export default router;
