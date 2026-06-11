import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { searchService } from '../services/search.service.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

const router = Router();

// Auth required untuk semua endpoint. Permission scope = tenant
// (SuperAdmin tanpa tenant header = cross-tenant via getEffectiveTenantId).
router.use(authMiddleware);

const querySchema = z.object({
    q: z.string().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(20).optional(),
});

/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * Global search aggregator — 5 entitas paralel:
 *   router, onu, customer, pppoe, netwatch
 *
 * Min query length: 2 char (di service layer). Query <2 char return
 * empty result. Backend tidak throw error — UI yang handle min length.
 *
 * Per-type limit default 5, max 20. Total max hasil = 5 × limit.
 *
 * Response shape:
 *   { data: { router: [...], onu: [...], ..., total: 23, query: 'rb' } }
 */
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const { q, limit } = querySchema.parse(req.query);
        const tenantId = getEffectiveTenantId(req);

        const results = await searchService.searchAll(q, tenantId, limit);
        res.json({ data: results });
    })
);

export default router;
