import { Router } from 'express';
import { z } from 'zod';
import { pppoeService } from '../services/pppoe.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Validation schemas
const updateCoordinatesSchema = z.object({
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    waypoints: z.string().optional(), // JSON string of coordinates
    connectionType: z.string().optional().nullable().transform(val => val === null ? undefined : val),
    connectedToId: z.string().uuid().optional().nullable().transform(val => val === null ? undefined : val),
});

// Apply auth middleware to all routes
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
    const routerId = req.query.routerId as string | undefined;
    // Pass user context for RBAC filtering
    const sessions = await pppoeService.findAll(
        routerId,
        req.user?.id,
        req.user?.role,
        (req.user?.tenantId as string) || undefined
    );
    res.json({ data: sessions });
}));

/**
 * GET /api/pppoe/map
 * Get PPPoE sessions with coordinates for map display
 */
router.get('/map', asyncHandler(async (req, res) => {
    const routerId = req.query.routerId as string | undefined;
    // Pass user context for RBAC filtering
    const sessions = await pppoeService.findAllWithCoordinates(
        routerId,
        req.user?.id,
        req.user?.role,
        (req.user?.tenantId as string) || undefined
    );
    res.json({ data: sessions });
}));

/**
 * GET /api/pppoe/:id
 * Get a single PPPoE session
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const session = await pppoeService.findById(req.params.id as string, (req.user?.tenantId as string) || undefined);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ data: session });
}));

/**
 * PATCH /api/pppoe/:id/coordinates
 * Update PPPoE session coordinates, waypoints and connection info (requires operator or admin)
 */
router.patch('/:id/coordinates', requireOperator, asyncHandler(async (req, res) => {
    const { latitude, longitude, waypoints, connectionType, connectedToId } = updateCoordinatesSchema.parse(req.body);

    const session = await pppoeService.updateCoordinates(
        req.params.id as string,
        latitude,
        longitude,
        waypoints,
        connectionType,
        connectedToId,
        (req.user?.tenantId as string) || undefined
    );

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ data: session });
}));

/**
 * PUT /api/pppoe/:id
 * Update PPPoE session (requires operator or admin)
 */
router.put('/:id', requireOperator, asyncHandler(async (req, res) => {
    const { latitude, longitude, waypoints, connectionType, connectedToId } = updateCoordinatesSchema.parse(req.body);

    const session = await pppoeService.updateCoordinates(
        req.params.id as string,
        latitude,
        longitude,
        waypoints,
        connectionType,
        connectedToId,
        (req.user?.tenantId as string) || undefined
    );

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ data: session });
}));

export default router;

