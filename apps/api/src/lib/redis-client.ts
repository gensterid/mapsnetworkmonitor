import IORedis from 'ioredis';
import { logger } from './logger.js';

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

            redisConnection.on('connect', () => {
                logger.info('Connected to Redis');
            });
        } catch (err: any) {
            logger.error({ err: err.message }, 'Failed to initialize Redis connection');
        }
    }
    return redisConnection;
}

export async function closeRedisConnection() {
    if (redisConnection) {
        await redisConnection.quit();
        redisConnection = null;
    }
}

export default getRedisConnection;
