import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../lib/logger.js';
import { routerService } from './router.service.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Shared Redis connection
let redisConnection: IORedis | null = null;

export function getRedisConnection() {
    if (!redisConnection) {
        try {
            redisConnection = new IORedis(REDIS_URL, {
                maxRetriesPerRequest: null,
                retryStrategy: (times: number) => {
                    const delay = Math.min(times * 100, 15000);
                    return delay;
                },
            });

            redisConnection.on('error', (err: Error) => {
                logger.error({ err: err.message }, 'Redis connection error');
            });
        } catch (err: any) {
            logger.error({ err: err.message }, 'Failed to initialize Redis connection');
        }
    }
    return redisConnection;
}

// === Router Sync Queue ===
export const routerSyncQueue = new Queue('router-sync', {
    connection: getRedisConnection() as any,
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
            connection: getRedisConnection() as any,
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
    if (redisConnection) {
        await redisConnection.quit();
        redisConnection = null;
    }
}
