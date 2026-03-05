import { Redis, type RedisOptions } from 'ioredis';
import { logger } from './logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisOptions: RedisOptions = {
    maxRetriesPerRequest: 3, // Fail fast instead of hanging
    enableOfflineQueue: false, // Don't queue commands when disconnected
    retryStrategy: (times: number) => {
        // Stop retrying after 5 attempts if we can't connect at all
        if (times > 5) return null;
        const delay = Math.min(times * 100, 15000);
        return delay;
    },
};

export const bullmqRedisOptions: RedisOptions = {
    ...redisOptions,
    maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
};

// Shared Redis connection
let redisConnection: Redis | null = null;

export function getRedisConnection() {
    if (!redisConnection) {
        try {
            redisConnection = new Redis(REDIS_URL, redisOptions);

            redisConnection.on('error', (err: Error) => {
                logger.error({ err: err.message }, 'Redis connection error (Shared)');
            });

            redisConnection.on('connect', () => {
                logger.info('Connected to Redis (Shared)');
            });
        } catch (err: any) {
            logger.error({ err: err.message }, 'Failed to initialize shared Redis connection');
        }
    }
    return redisConnection;
}

/**
 * Creates a fresh Redis connection.
 * Essential for BullMQ Workers as they use blocking commands.
 */
export function createRedisConnection() {
    const conn = new Redis(REDIS_URL, bullmqRedisOptions);
    conn.on('error', (err: Error) => {
        logger.error({ err: err.message }, 'Redis connection error (Fresh)');
    });
    return conn;
}

export async function closeRedisConnection() {
    if (redisConnection) {
        await redisConnection.quit();
        redisConnection = null;
    }
}

export default getRedisConnection;
