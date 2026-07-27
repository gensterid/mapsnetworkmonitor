import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireTenantContext } from '../middleware/tenant-context.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { customer360Service } from '../services/customer-360.service.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

const router = Router();

router.use(authMiddleware);
// Cegah akun orphan (non-superadmin tanpa tenantId) mengakses data customer
// lintas-tenant — getEffectiveTenantId-nya null → scoping ter-drop.
router.use(requireTenantContext);

const paramSchema = z.object({
    id: z.string().uuid(),
});

/**
 * GET /api/customers/:id/360
 *
 * Customer 360° aggregator. Return semua data customer + summary
 * dalam 1 response. Frontend tab cuma filter view.
 *
 * Tenant scoping via getEffectiveTenantId — operator hanya bisa
 * akses customer dari tenant-nya sendiri. SuperAdmin tanpa header
 * x-tenant-id bisa cross-tenant (existing pattern).
 */
router.get(
    '/:id/360',
    asyncHandler(async (req, res) => {
        const { id } = paramSchema.parse(req.params);
        const tenantId = getEffectiveTenantId(req);

        const data = await customer360Service.getCustomer360(id, tenantId);
        res.json({ data });
    })
);

export default router;
