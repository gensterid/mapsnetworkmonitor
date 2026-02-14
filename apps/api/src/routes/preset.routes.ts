import { Router } from 'express';
import { presetService } from '../services/preset.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
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

// GET /presets
router.get('/', authMiddleware, async (req, res) => {
    try {
        const presets = await presetService.findAll();
        res.json(presets);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// GET /presets/:id
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const preset = await presetService.findById(req.params.id);
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json(preset);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// POST /presets
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const data = createSchema.parse(req.body);
        const preset = await presetService.create(data as unknown as NewPreset); // Fix type mismatch
        res.status(201).json(preset);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// PATCH /presets/:id
router.patch('/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const data = updateSchema.parse(req.body);
        const preset = await presetService.update(req.params.id, data);
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json(preset);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// DELETE /presets/:id
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const preset = await presetService.delete(req.params.id);
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

export default router;
