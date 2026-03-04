import { getRedisConnection } from './redis-client.js';
import { logger } from './logger.js';

// Simple Redis-backed cache utility
class CacheService {
    /**
     * Set a value in the cache with a Time-To-Live (TTL)
     * @param key Unique identifier for the cached data
     * @param data The data to cache
     * @param ttlSeconds Time-to-live in seconds
     */
    async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
        const redis = getRedisConnection();
        if (!redis) return;

        try {
            const value = JSON.stringify(data);
            await redis.set(key, value, 'EX', ttlSeconds);
        } catch (err: any) {
            logger.error({ err: err.message, key }, 'Failed to set cache');
        }
    }

    /**
     * Get a value from the cache if it exists and hasn't expired
     * @param key Unique identifier for the cached data
     * @returns The cached data, or null if not found/expired
     */
    async get<T>(key: string): Promise<T | null> {
        const redis = getRedisConnection();
        if (!redis) return null;

        try {
            const value = await redis.get(key);
            if (!value) return null;
            return JSON.parse(value) as T;
        } catch (err: any) {
            logger.error({ err: err.message, key }, 'Failed to get cache');
            return null;
        }
    }

    /**
     * Delete a specific key from the cache
     */
    async delete(key: string): Promise<void> {
        const redis = getRedisConnection();
        if (!redis) return;

        try {
            await redis.del(key);
        } catch (err: any) {
            logger.error({ err: err.message, key }, 'Failed to delete cache');
        }
    }

    /**
     * Delete multiple keys matching a pattern (e.g. "routers:*")
     */
    async deletePattern(pattern: string): Promise<void> {
        const redis = getRedisConnection();
        if (!redis) return;

        try {
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (err: any) {
            logger.error({ err: err.message, pattern }, 'Failed to delete pattern from cache');
        }
    }

    /**
     * Clear the entire cache
     */
    async clear(): Promise<void> {
        const redis = getRedisConnection();
        if (!redis) return;

        try {
            await redis.flushdb();
        } catch (err: any) {
            logger.error({ err: err.message }, 'Failed to clear cache');
        }
    }
}

export const cacheService = new CacheService();
export default cacheService;
