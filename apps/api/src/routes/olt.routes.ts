import { Router } from 'express';
import { oltService } from '../services/olt.service.js';
import { z } from 'zod';

import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Validation schemas
const createOltSchema = z.object({
    name: z.string().min(1),
    host: z.string().min(1),
    snmpPort: z.number().default(161),
    snmpCommunity: z.string().default('public'),
    type: z.enum(['hsgq', 'cdata', 'generic']).default('generic'),
    description: z.string().optional(),

    // Web/API Fields
    webPort: z.number().default(80),
    webUsername: z.string().optional(),
    webPassword: z.string().optional(),
    webProtocol: z.enum(['http', 'https']).default('http'),
    useSnmp: z.boolean().default(true),
    useWeb: z.boolean().default(false),
    parentId: z.string().uuid().optional().nullable(),
});

const updateOltSchema = createOltSchema.partial();

// Get all OLTs
router.get('/', async (req, res) => {
    try {
        // @ts-ignore - user added by authMiddleware
        const olts = await oltService.findAll(req.user?.id, req.user?.role);
        res.json(olts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch OLTs' });
    }
});

// Get OLT by ID
router.get('/:id', async (req, res) => {
    try {
        // @ts-ignore
        const olt = await oltService.findById(req.params.id, req.user?.id, req.user?.role);
        if (!olt) {
            return res.status(404).json({ error: 'OLT not found' });
        }
        res.json(olt);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch OLT' });
    }
});

// Create OLT
router.post('/', async (req, res) => {
    try {
        const data = createOltSchema.parse(req.body);
        const olt = await oltService.create(data);
        res.status(201).json(olt);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create OLT' });
    }
});

// Update OLT
router.patch('/:id', async (req, res) => {
    try {
        const data = updateOltSchema.parse(req.body);
        const olt = await oltService.update(req.params.id, data);
        if (!olt) {
            return res.status(404).json({ error: 'OLT not found' });
        }
        res.json(olt);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to update OLT' });
    }
});

// Delete OLT
router.delete('/:id', async (req, res) => {
    try {
        const success = await oltService.delete(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'OLT not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete OLT' });
    }
});

// Get OLT ONUs (via Driver)
router.get('/:id/onus', async (req, res) => {
    try {
        console.log(`GET /api/olts/${req.params.id}/onus - Fetching ONUs...`);
        const onus = await oltService.getOnus(req.params.id);
        res.json(onus);
    } catch (error: any) {
        console.error(`API Error in /olts/${req.params.id}/onus:`, error);
        res.status(500).json({
            error: 'Failed to fetch ONUs',
            message: error.message,
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Refresh OLT status
router.post('/:id/refresh', async (req, res) => {
    try {
        const olt = await oltService.refreshStatus(req.params.id);
        if (!olt) {
            return res.status(404).json({ error: 'OLT not found' });
        }
        res.json(olt);
    } catch (error) {
        res.status(500).json({ error: 'Failed to refresh OLT status' });
    }
});

export default router;
