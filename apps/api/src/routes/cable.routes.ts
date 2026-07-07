import { Router } from 'express';
import { z } from 'zod';
import { cableService } from '../services/cable.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

const router = Router();

router.use(authMiddleware);

// Tenant-context guard (sama seperti topology): non-superadmin TANPA tenantId
// (akun orphan) tidak boleh lolos scoping → tolak di sini (cegah IDOR).
router.use((req, _res, next) => {
    const u = (req as any).user;
    if (u?.role !== 'superadmin' && !u?.tenantId) {
        return next(new ApiError(403, 'Tenant context required'));
    }
    next();
});

const latLng = z.tuple([z.number(), z.number()]);
const cableSchema = z.object({
    name: z.string().max(200).optional().nullable(),
    routerId: z.string().uuid().optional().nullable(),
    path: z.array(latLng).min(2, 'Kabel butuh minimal 2 titik'),
    cores: z.array(z.number().int().min(1).max(96)).min(1, 'Pilih minimal 1 core').max(96),
    fromDeviceId: z.string().uuid().optional().nullable(),
    toDeviceId: z.string().uuid().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
});
const cableUpdateSchema = cableSchema.partial();

// GET /api/cables?routerId=
router.get('/', asyncHandler(async (req, res) => {
    const routerId = typeof req.query.routerId === 'string' ? req.query.routerId : undefined;
    const cables = await cableService.list(getEffectiveTenantId(req), routerId);
    res.json({ data: cables });
}));

// GET /api/cables/:id
router.get('/:id', asyncHandler(async (req, res) => {
    const cable = await cableService.getById(req.params.id as string, getEffectiveTenantId(req));
    if (!cable) throw new ApiError(404, 'Cable not found');
    res.json({ data: cable });
}));

// POST /api/cables
router.post('/', requireOperator, asyncHandler(async (req, res) => {
    const data = cableSchema.parse(req.body);
    const cable = await cableService.create(data, getEffectiveTenantId(req));
    res.status(201).json({ data: cable });
}));

// PUT /api/cables/:id
router.put('/:id', requireOperator, asyncHandler(async (req, res) => {
    const data = cableUpdateSchema.parse(req.body);
    const cable = await cableService.update(req.params.id as string, data, getEffectiveTenantId(req));
    res.json({ data: cable });
}));

// DELETE /api/cables/:id
router.delete('/:id', requireOperator, asyncHandler(async (req, res) => {
    await cableService.delete(req.params.id as string, getEffectiveTenantId(req));
    res.json({ data: { success: true } });
}));

export default router;
