import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { db } from '../db/index.js';
import { eq, and, or, sql, inArray } from 'drizzle-orm';
import { routers, routerNetwatch } from '../db/schema/index.js';
import { eventEmitter } from '../services/event-emitter.service.js';
import { logger } from '../lib/logger.js';
import { alertService } from '../services/index.js';

const router = Router();

// Webhook-specific rate limiter: 60 requests per minute per IP
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many webhook requests, slow down' },
});

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
    webhookLimiter,
    asyncHandler(async (req, res) => {
        const query = webhookSchema.safeParse(req.query);

        if (!query.success) {
            logger.warn({ err: query.error.format() }, 'Invalid webhook payload received');
            throw new ApiError(400, 'Invalid webhook payload');
        }

        const { host, status, token: queryToken } = query.data;
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const token = bearerToken || queryToken;

        if (!token) {
            throw new ApiError(401, 'Unauthorized: Webhook token required in Authorization header or query');
        }

        // 1. Verify router by the secure token
        const routerRecord = await db.query.routers.findFirst({
            where: and(eq(routers.webhookSecret, token))
        });

        if (!routerRecord || !routerRecord.useWebhook) {
            logger.warn({ host, status }, 'Unauthorized or disabled webhook attempt');
            throw new ApiError(401, 'Unauthorized webhook token or webhook disabled');
        }

        // 2. Identify all related routers (Clones) to propagate the update.
        // This is the CORE of the v8 Ultimate-Fix: Propagating real-time status to all logical
        // router entries that represent the same physical hardware (e.g. multiple VPN tunnels).
        const relatedRouters = await db.select({ id: routers.id, name: routers.name })
            .from(routers)
            .where(
                or(
                    routerRecord.serialNumber ? eq(routers.serialNumber, routerRecord.serialNumber) : sql`false`,
                    routerRecord.identity ? eq(routers.identity, routerRecord.identity) : sql`false`,
                    eq(routers.host, routerRecord.host)
                )
            );

        const relatedIds = relatedRouters.map(r => r.id);

        // 3. Find all netwatch entries for this host across all related routers
        const netwatchRecords = await db.select()
            .from(routerNetwatch)
            .where(and(
                inArray(routerNetwatch.routerId, relatedIds),
                eq(routerNetwatch.host, host)
            ));

        if (netwatchRecords.length === 0) {
            // Netwatch entry not found in DB, just ignore (might be a deleted node still in mikrotik)
            res.json({ data: { success: true, message: 'Host not tracked, ignored' } });
            return;
        }

        // 4. Update Status for all matching records
        const now = new Date();
        const results = [];

        for (const netwatchRecord of netwatchRecords) {
            const updateData: any = {
                status,
                lastCheck: now,
                updatedAt: now,
            };

            if (status === 'up') {
                updateData.lastUp = now;
            } else {
                updateData.lastDown = now;
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

                const routerInfo = relatedRouters.find(r => r.id === netwatchRecord.routerId);

                await alertService.createNetwatchAlert(
                    netwatchRecord.routerId,
                    netwatchRecord.name || host,
                    host,
                    status as 'up' | 'down'
                );

                // 5. Broadcast instant update to all connected frontend clients
                eventEmitter.broadcast('map_update', {
                    routerId: netwatchRecord.routerId,
                    source: 'webhook',
                    host: host,
                    status: status
                });

                results.push(netwatchRecord.routerId);
            }
        }

        if (results.length > 0) {
            logger.info({
                triggeredById: routerRecord.id,
                propagatedTo: results,
                host,
                status
            }, 'Multi-router Webhook update processed');
        }

        res.json({ data: { success: true, status: 'updated' } });
    })
);

/**
 * GET /api/webhook/backup-report
 * Triggered by MikroTik after a successful automated email backup
 */
router.get(
    '/backup-report',
    webhookLimiter,
    asyncHandler(async (req, res) => {
        const { routerId, type, status, token: queryToken } = req.query;
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const token = (bearerToken || queryToken) as string;

        if (!routerId || !token) {
            logger.warn({ query: req.query, hasAuthHeader: !!authHeader }, 'Backup report missing routerId or token');
            throw new ApiError(400, 'Missing routerId or token');
        }

        // Verify router
        const routerRecord = await db.query.routers.findFirst({
            where: and(
                eq(routers.id, routerId as string),
                eq(routers.webhookSecret, token as string)
            )
        });

        if (!routerRecord) {
            // DIAGNOSTIC LOGGING: Check if router exists at all with this ID
            const routerExists = await db.query.routers.findFirst({
                where: eq(routers.id, routerId as string)
            });

            logger.error({ 
                routerId, 
                tokenProvided: token,
                routerExists: !!routerExists,
                actualSecretMatch: routerExists ? (routerExists.webhookSecret === token) : 'N/A'
            }, 'Unauthorized backup report attempt');

            throw new ApiError(401, 'Unauthorized');
        }

        logger.info({ routerId, type, status }, 'Backup report received via webhook');

        // Persistent Logging: If it's a successful email backup, save to history
        if (type === 'email' && status === 'success') {
            try {
                const { routerBackups } = await import('../db/schema/index.js');
                await db.insert(routerBackups).values({
                    routerId: routerId as string,
                    tenantId: routerRecord.tenantId!,
                    filename: 'Direct to Email',
                    type: 'email',
                    size: 0,
                    comment: `Automated Email Backup sent to ${routerRecord.emailSmtpRecipient}`,
                    createdAt: new Date()
                });
            } catch (err) {
                logger.error({ err, routerId }, 'Failed to log email backup to database');
            }
        }

        // Broadcast to frontend
        eventEmitter.broadcast('backup_status', {
            routerId,
            routerName: routerRecord.name,
            type: type || 'email',
            status: status || 'success',
            timestamp: new Date()
        });

        res.json({ success: true });
    })
);

export default router;
