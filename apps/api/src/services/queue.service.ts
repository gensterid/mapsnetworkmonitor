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
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 10000,
        },
        removeOnComplete: true,
        removeOnFail: 100, // Keep last 100 failures for debugging
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
                await routerService.refreshRouterStatus(routerId, includeNetwatch, isFullSync);
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
            concurrency: 10, // Process 10 routers at a time
        }
    );

    worker.on('completed', (job: Job) => {
        logger.debug({ jobId: job.id }, 'Sync job completed');
    });

    worker.on('failed', (job: Job | undefined, err: Error) => {
        logger.error({ jobId: job?.id, err: err.message }, 'Sync job failed permanently');
    });
}

export async function stopQueueWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
    await closeRedisConnection();
}
