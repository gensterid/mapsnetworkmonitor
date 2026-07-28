import { Router } from 'express';
import { presetService } from '../services/preset.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin, requireOperator } from '../middleware/rbac.middleware.js';
import { requireTenantContext } from '../middleware/tenant-context.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { z } from 'zod';
import { NewPreset } from '../db/schema/presets.js';

const router = Router();

// Validation Schemas (Inline for simplicity now, move later if needed)
const createSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(['wan', 'wifi']),
    config: z.any()
});

const updateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    type: z.enum(['wan', 'wifi']).optional(),
    config: z.any().optional()
});

// GET /presets — baca dibatasi Operator+ (config bisa memuat kredensial PPPoE; samakan preseden M6)
router.get('/', authMiddleware, requireTenantContext, requireOperator, async (req, res) => {
    try {
        const presets = await presetService.findAll(getEffectiveTenantId(req));
        res.json({ data: presets });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// GET /presets/:id — baca dibatasi Operator+
router.get('/:id', authMiddleware, requireTenantContext, requireOperator, async (req, res) => {
    try {
        const preset = await presetService.findById(req.params.id as string, getEffectiveTenantId(req));
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json({ data: preset });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// POST /presets
router.post('/', authMiddleware, requireTenantContext, requireAdmin, async (req, res) => {
    try {
        const data = createSchema.parse(req.body);
        // tenantId dipaksa dari konteks pemanggil — tak boleh dari body.
        const preset = await presetService.create({
            ...data,
            tenantId: getEffectiveTenantId(req),
        } as unknown as NewPreset);
        res.status(201).json({ data: preset });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// PATCH /presets/:id
router.patch('/:id', authMiddleware, requireTenantContext, requireAdmin, async (req, res) => {
    try {
        const data = updateSchema.parse(req.body);
        const preset = await presetService.update(req.params.id as string, data, getEffectiveTenantId(req));
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json({ data: preset });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// DELETE /presets/:id
router.delete('/:id', authMiddleware, requireTenantContext, requireAdmin, async (req, res) => {
    try {
        const preset = await presetService.delete(req.params.id as string, getEffectiveTenantId(req));
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

export default router;
