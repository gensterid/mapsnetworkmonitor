import { Router } from 'express';
import { z } from 'zod';
import { oltService } from '../services/olt.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { logger } from '../lib/logger.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { strictLimiter } from '../config/security.js';

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

// Apply auth middleware to all routes except ping
router.use(authMiddleware);

// Get all ONUs for a specific router (via OLTs)
router.get('/onus/by-router/:routerId', asyncHandler(async (req, res) => {
    const onus = await oltService.getOnusByRouter(req.params.routerId as string, getEffectiveTenantId(req));
    res.json({ data: onus });
}));

// Get all ONUs with coordinates for map display
router.get('/onus/map', asyncHandler(async (req, res) => {
    const onus = await oltService.getAllOnusWithCoordinates(
        getEffectiveTenantId(req),
        req.user?.id,
        req.user?.role
    );
    res.json({ data: onus });
}));

 
// Get all OLTs
router.get('/', asyncHandler(async (req, res) => {
    const olts = await oltService.findAll(getEffectiveTenantId(req), req.user?.id, req.user?.role);
    res.json({ data: olts });
}));

// Get OLT by ID
router.get('/:id', asyncHandler(async (req, res) => {
    const olt = await oltService.findById(req.params.id as string, getEffectiveTenantId(req), req.user?.id, req.user?.role);
    if (!olt) {
        throw ApiError.notFound('OLT not found');
    }
    res.json({ data: olt });
}));

// Create OLT
// Requires: Operator or Admin
router.post('/', strictLimiter, requireOperator, asyncHandler(async (req, res) => {
    const data = createOltSchema.parse(req.body);
    const olt = await oltService.create(data, req.user!.tenantId!);
    res.status(201).json({ data: olt });
}));

// Update OLT
// Requires: Operator or Admin
router.patch('/:id', strictLimiter, requireOperator, asyncHandler(async (req, res) => {
    const data = updateOltSchema.parse(req.body);
    const olt = await oltService.update(req.params.id as string, data, getEffectiveTenantId(req));
    if (!olt) {
        throw ApiError.notFound('OLT not found');
    }
    res.json({ data: olt });
}));

// Delete OLT
// Requires: Admin
router.delete('/:id', strictLimiter, requireAdmin, asyncHandler(async (req, res) => {
    const success = await oltService.delete(req.params.id as string, getEffectiveTenantId(req));
    if (!success) {
        throw ApiError.notFound('OLT not found');
    }
    res.json({ data: { success: true } });
}));

// Get OLT ONUs (via Driver)
router.get('/:id/onus', asyncHandler(async (req, res) => {
    const onus = await oltService.getOnus(req.params.id as string, getEffectiveTenantId(req));
    res.json({ data: onus });
}));

// Update ONU
// Requires: Operator or Admin
router.patch('/:id/onus/:onuId', strictLimiter, requireOperator, asyncHandler(async (req, res) => {
    const { onuId } = req.params;
    const validatedData = updateOnuSchema.parse(req.body);

    const updatedHook = await oltService.updateOnu(
        onuId as string,
        validatedData,
        getEffectiveTenantId(req),
        req.user?.id,
        req.user?.role
    );
    if (!updatedHook) {
        throw ApiError.notFound('ONU not found or access denied');
    }
    res.json({ data: updatedHook });
}));

// Refresh OLT status
// Requires: Operator or Admin
router.post('/:id/refresh', strictLimiter, requireOperator, asyncHandler(async (req, res) => {
    const olt = await oltService.refreshStatus(req.params.id as string, getEffectiveTenantId(req));
    if (!olt) {
        throw ApiError.notFound('OLT not found');
    }
    res.json({ data: olt });
}));

// Reboot ONU
// Requires: Operator or Admin
router.post('/:id/onus/:onuId/reboot', strictLimiter, requireOperator, asyncHandler(async (req, res) => {
    const { id, onuId } = req.params;
    const { ponId } = req.body;

    if (!ponId) {
        throw ApiError.badRequest('ponId is required in request body');
    }

    const success = await oltService.rebootOnu(
        id as string,
        ponId as string,
        onuId as string,
        getEffectiveTenantId(req)
    );

    if (!success) {
        throw new ApiError(500, 'Failed to reboot ONU. The OLT might be unreachable or the protocol is not supported.');
    }

    res.json({ data: { success: true } });
}));

export default router;
