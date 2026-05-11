import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import { getRedisConnection, closeRedisConnection, createRedisConnection } from '../lib/redis-client.js';
import { routerService } from './router.service.js';

// Re-export for compatibility
export { getRedisConnection };

// === Router Sync Queue ===
export const routerSyncQueue = new Queue('router-sync', {
    connection: createRedisConnection() as any,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: true,
        removeOnFail: 100,
    },
});

// === OLT Sync Queue ===
export const oltSyncQueue = new Queue('olt-sync', {
    connection: createRedisConnection() as any,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: true,
        removeOnFail: 100,
    },
});

// === Worker Implementation ===
let worker: Worker | null = null;

export function startQueueWorker() {
    if (worker) return;

    logger.info('🚀 Starting Queue Worker (BullMQ)...');

    worker = new Worker(
        'router-sync',
        async (job: Job) => {
            const { routerId, includeNetwatch, isFullSync, tenantId } = job.data;

            logger.debug({
                jobId: job.id,
                routerId,
                isFullSync
            }, 'Processing router sync job');

            try {
                // We use routerService directly which handles state/db updates
                await routerService.refreshRouterStatus(routerId, includeNetwatch, isFullSync, tenantId);
                return { success: true };
            } catch (err: any) {
                logger.error({
                    err: err.message,
                    routerId,
                    jobId: job.id
                }, 'Router sync job failed');
                throw err; // Throw to trigger BullMQ retry
            }
        },
        {
            connection: createRedisConnection() as any,
            // Tunable: at ~15s per router poll, concurrency=20 lets us drain
            // 80 routers per minute. Raise for larger fleets, lower if MikroTik
            // boxes or the DB connection pool become saturated.
            concurrency: parseInt(process.env.ROUTER_SYNC_CONCURRENCY || '20', 10),
        }
    );

    worker.on('completed', (job: Job) => {
        logger.debug({ jobId: job.id }, 'Sync job completed');
    });

    worker.on('failed', (job: Job | undefined, err: Error) => {
        logger.error({ jobId: job?.id, err: err.message }, 'Sync job failed permanently');
    });

    // OLT Worker Implementation
    new Worker(
        'olt-sync',
        async (job: Job) => {
            const { oltId, tenantId, type } = job.data;
            const { oltService } = await import('./olt.service.js');

            logger.debug({ oltId, type }, 'Processing OLT sync job');

            try {
                if (type === 'refresh') {
                    await oltService.refreshStatus(oltId, tenantId);
                } else if (type === 'sync-inventory') {
                    await oltService.refreshStatus(oltId, tenantId);
                    await oltService.syncOnuInventory(oltId, tenantId);
                }
                return { success: true };
            } catch (err: any) {
                logger.error({ err: err.message, oltId, type }, 'OLT sync job failed');
                throw err;
            }
        },
        {
            connection: createRedisConnection() as any,
            concurrency: parseInt(process.env.OLT_SYNC_CONCURRENCY || '10', 10),
        }
    );
}

export async function stopQueueWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
    await closeRedisConnection();
}
