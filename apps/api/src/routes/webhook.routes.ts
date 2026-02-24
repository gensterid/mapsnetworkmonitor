import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { db } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { routers, routerNetwatch } from '../db/schema/index.js';
import { eventEmitter } from '../services/event-emitter.service.js';
import { logger } from '../lib/logger.js';
import { alertService } from '../services/index.js';

const router = Router();

const webhookSchema = z.object({
    host: z.string().min(1),
    status: z.enum(['up', 'down']),
    token: z.string().min(1)
});

/**
 * GET /api/webhook/netwatch
 * Dedicated high-performance endpoint for MikroTik netwatch push notifications.
 * Uses query parameters for easy fetch execution from RouterOS.
 * Example: /api/webhook/netwatch?host=1.1.1.1&status=down&token=xyz
 */
router.get(
    '/netwatch',
    asyncHandler(async (req, res) => {
        const query = webhookSchema.safeParse(req.query);

        if (!query.success) {
            logger.warn({ err: query.error.format() }, 'Invalid webhook payload received');
            throw new ApiError(400, 'Invalid webhook payload');
        }

        const { host, status, token } = query.data;

        // 1. Verify router by the secure token
        const routerRecord = await db.query.routers.findFirst({
            where: and(eq(routers.webhookSecret, token))
        });

        if (!routerRecord || !routerRecord.useWebhook) {
            logger.warn({ host, status }, 'Unauthorized or disabled webhook attempt');
            throw new ApiError(401, 'Unauthorized webhook token or webhook disabled');
        }

        // 2. Find existing netwatch entry
        const netwatchRecord = await db.query.routerNetwatch.findFirst({
            where: and(
                eq(routerNetwatch.routerId, routerRecord.id),
                eq(routerNetwatch.host, host)
            )
        });

        if (!netwatchRecord) {
            // Netwatch entry not found in DB, just ignore (might be a deleted node still in mikrotik)
            res.json({ success: true, message: 'Host not tracked, ignored' });
            return;
        }

        // 3. Update Status
        const now = new Date();
        const updateData: any = {
            status,
            lastCheck: now,
            updatedAt: now,
        };

        if (status === 'up') {
            updateData.lastUp = now;
        } else {
            updateData.lastDown = now;
            // Capture last latency before going completely offline
            if (netwatchRecord.latency !== null && netwatchRecord.latency !== undefined) {
                updateData.lastKnownLatency = netwatchRecord.latency;
            }
        }

        // Only update database and send alerts if status ACTUALLY changed to avoid spam
        if (netwatchRecord.status !== status) {
            await db
                .update(routerNetwatch)
                .set(updateData)
                .where(eq(routerNetwatch.id, netwatchRecord.id));

            await alertService.createNetwatchAlert(
                routerRecord.id,
                netwatchRecord.name || host,
                host,
                status as 'up' | 'down'
            );

            // 4. Broadcast instant update to all connected frontend clients
            eventEmitter.broadcast('map_update', { routerId: routerRecord.id, source: 'webhook' });
            logger.info({ routerId: routerRecord.id, host, status }, 'Fast Webhook update processed');
        }

        res.json({ success: true, status: 'updated' });
    })
);

export default router;
