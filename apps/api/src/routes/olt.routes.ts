import { Router } from 'express';
import { z } from 'zod';
import { oltService } from '../services/olt.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { logger } from '../lib/logger.js';

const router = Router();

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

const updateOnuSchema = z.object({
    latitude: z.string().optional().nullable(),
    longitude: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    connectionType: z.string().optional().nullable(),
    connectedToId: z.string().uuid().optional().nullable(),
    waypoints: z.string().optional().nullable(),
    targetInterface: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    macAddress: z.string().optional().nullable(),
});

// --- DEBUG ROUTES (Move above auth for 404 troubleshooting) ---
router.get('/ping', (req, res) => res.json({ status: 'ok', msg: 'OLT Router is active' }));

// Get all ONUs for a specific router (via OLTs)
router.get('/onus/by-router/:routerId', asyncHandler(async (req, res) => {
    const onus = await oltService.getOnusByRouter(req.params.routerId as string);
    res.json(onus);
}));

// Get all ONUs with coordinates for map display
router.get('/onus/map', asyncHandler(async (req, res) => {
    const onus = await oltService.getAllOnusWithCoordinates();
    res.json(onus);
}));

// Apply auth middleware to all OTHER routes
router.use(authMiddleware);

// Get all OLTs
router.get('/', asyncHandler(async (req, res) => {
    const olts = await oltService.findAll(req.user?.id, req.user?.role);
    res.json(olts);
}));

// Get OLT by ID
router.get('/:id', asyncHandler(async (req, res) => {
    const olt = await oltService.findById(req.params.id as string, req.user?.id, req.user?.role);
    if (!olt) {
        throw ApiError.notFound('OLT not found');
    }
    res.json(olt);
}));

// Create OLT
router.post('/', asyncHandler(async (req, res) => {
    const data = createOltSchema.parse(req.body);
    const olt = await oltService.create(data);
    res.status(201).json(olt);
}));

// Update OLT
router.patch('/:id', asyncHandler(async (req, res) => {
    const data = updateOltSchema.parse(req.body);
    const olt = await oltService.update(req.params.id as string, data);
    if (!olt) {
        throw ApiError.notFound('OLT not found');
    }
    res.json(olt);
}));

// Delete OLT
router.delete('/:id', asyncHandler(async (req, res) => {
    const success = await oltService.delete(req.params.id as string);
    if (!success) {
        throw ApiError.notFound('OLT not found');
    }
    res.json({ success: true });
}));

// Get OLT ONUs (via Driver)
router.get('/:id/onus', asyncHandler(async (req, res) => {
    const onus = await oltService.getOnus(req.params.id as string);
    res.json(onus);
}));

// Update ONU
router.patch('/:id/onus/:onuId', asyncHandler(async (req, res) => {
    const { onuId } = req.params;
    const validatedData = updateOnuSchema.parse(req.body);

    const updatedHook = await oltService.updateOnu(onuId as string, validatedData);
    if (!updatedHook) {
        throw ApiError.notFound('ONU not found');
    }
    res.json(updatedHook);
}));

// Refresh OLT status
router.post('/:id/refresh', asyncHandler(async (req, res) => {
    const olt = await oltService.refreshStatus(req.params.id as string);
    if (!olt) {
        throw ApiError.notFound('OLT not found');
    }
    res.json(olt);
}));

export default router;
