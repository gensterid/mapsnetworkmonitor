import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { eventEmitter } from '../services/event-emitter.service.js';

const router = Router();

/**
 * GET /api/events
 * Server-Sent Events endpoint for real-time updates
 */
router.get('/', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Generate unique client ID
    const clientId = randomUUID();

    // Add client to the list
    eventEmitter.addClient(clientId, res);

    // Send initial connection confirmation
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, message: 'SSE connection established' })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
        eventEmitter.removeClient(clientId);
    });
});

/**
 * GET /api/events/status
 * Get SSE connection status
 */
router.get('/status', (_req: Request, res: Response) => {
    res.json({
        connectedClients: eventEmitter.getClientCount(),
        status: 'active'
    });
});

export const eventsRoutes = router;
