import { Router } from 'express';
import { pppoeService } from '../services/pppoe.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/pppoe
 * Get all PPPoE sessions
 */
router.get('/', async (req, res) => {
    try {
        const routerId = req.query.routerId as string | undefined;
        // Pass user context for RBAC filtering
        const sessions = await pppoeService.findAll(
            routerId,
            req.user?.id,
            req.user?.role
        );
        res.json({ data: sessions });
    } catch (error) {
        console.error('Failed to get PPPoE sessions:', error);
        res.status(500).json({ error: 'Failed to get PPPoE sessions' });
    }
});

/**
 * GET /api/pppoe/map
 * Get PPPoE sessions with coordinates for map display
 */
router.get('/map', async (req, res) => {
    try {
        const routerId = req.query.routerId as string | undefined;
        // Pass user context for RBAC filtering
        const sessions = await pppoeService.findAllWithCoordinates(
            routerId,
            req.user?.id,
            req.user?.role
        );
        res.json({ data: sessions });
    } catch (error) {
        console.error('Failed to get PPPoE map data:', error);
        res.status(500).json({ error: 'Failed to get PPPoE map data' });
    }
});

/**
 * GET /api/pppoe/:id
 * Get a single PPPoE session
 */
router.get('/:id', async (req, res) => {
    try {
        const session = await pppoeService.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json({ data: session });
    } catch (error) {
        console.error('Failed to get PPPoE session:', error);
        res.status(500).json({ error: 'Failed to get PPPoE session' });
    }
});

/**
 * PATCH /api/pppoe/:id/coordinates
 * Update PPPoE session coordinates, waypoints and connection info (requires operator or admin)
 */
router.patch('/:id/coordinates', requireOperator, async (req, res) => {
    try {
        const { latitude, longitude, waypoints, connectionType, connectedToId } = req.body;

        const session = await pppoeService.updateCoordinates(
            req.params.id,
            latitude || null,
            longitude || null,
            waypoints || null,
            connectionType || null,
            connectedToId !== undefined ? connectedToId : null
        );

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ data: session });
    } catch (error) {
        console.error('Failed to update PPPoE coordinates:', error);
        res.status(500).json({ error: 'Failed to update coordinates' });
    }
});

/**
 * PUT /api/pppoe/:id
 * Update PPPoE session (requires operator or admin)
 */
router.put('/:id', requireOperator, async (req, res) => {
    try {
        const { latitude, longitude, waypoints, connectionType, connectedToId } = req.body;

        const session = await pppoeService.updateCoordinates(
            req.params.id,
            latitude || null,
            longitude || null,
            waypoints || null,
            connectionType || null,
            connectedToId !== undefined ? connectedToId : null
        );

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ data: session });
    } catch (error) {
        console.error('Failed to update PPPoE session:', error);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

export default router;

