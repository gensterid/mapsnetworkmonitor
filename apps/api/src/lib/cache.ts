/**
 * Redis-backed cache layer.
 * Provides typed get/set/delete for hot data paths.
 * 
 * Scalable and persistent across multiple instances.
 * Falls back to in-memory NodeCache if Redis connection is not established.
 */
import NodeCache from 'node-cache';
import { getRedisConnection } from './redis-client.js';
import { logger } from './logger.js';

// Default TTLs (in seconds)
const CACHE_TTL = {
    ROUTER_LIST: 30,
    ROUTER_DETAIL: 60,
    SETTINGS: 60,
    NETWATCH_STATS: 15,
    DASHBOARD: 20,
    GENIEACS_DEVICES: 65,
    GENIEACS_DEVICE: 60,
    // MikHMON shell — short for live data, longer for static lookups
    MIKHMON_LIVE: 3,     // active sessions, hosts, traffic stats
    MIKHMON_LIST: 10,    // user list, queue list
    MIKHMON_STATIC: 60,  // user profile, server profile, packages
};

// Fallback in-memory cache
const localCache = new NodeCache({
    stdTTL: 30,
    checkperiod: 60,
    useClones: false,
    maxKeys: 1000, 
});

/**
 * Cache service with async Redis support.
 */
export const cacheService = {
    /**
     * Get a cached value by key
     */
    async get<T>(key: string): Promise<T | undefined> {
        const redis = getRedisConnection();
        if (redis && redis.status === 'ready') {
            try {
                const val = await redis.get(key);
                if (!val) return undefined;
                return JSON.parse(val) as T;
            } catch (err) {
                logger.error({ key, err }, 'Redis GET failed, falling back to local');
            }
        }
        return localCache.get<T>(key);
    },

    /**
     * Set a cached value with optional TTL (in seconds)
     */
    async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
        const redis = getRedisConnection();
        const effectiveTtl = ttl ?? 30;

        if (redis && redis.status === 'ready') {
            try {
                const serialized = JSON.stringify(value);
                await redis.set(key, serialized, 'EX', effectiveTtl);
                return true;
            } catch (err) {
                logger.error({ key, err }, 'Redis SET failed, falling back to local');
            }
        }
        return localCache.set(key, value, effectiveTtl);
    },

    /**
     * Delete a specific cached key
     */
    async delete(key: string): Promise<number> {
        const redis = getRedisConnection();
        if (redis && redis.status === 'ready') {
            try {
                return await redis.del(key);
            } catch (err) {
                logger.error({ key, err }, 'Redis DEL failed');
            }
        }
        return localCache.del(key);
    },

    /**
     * Delete all cache entries matching a glob-like pattern (e.g., "routers:list:*")
     */
    async deletePattern(pattern: string): Promise<number> {
        const redis = getRedisConnection();
        if (redis && redis.status === 'ready') {
            try {
                let deletedCount = 0;
                let cursor = '0';
                
                do {
                    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                    cursor = nextCursor;
                    
                    if (keys.length > 0) {
                        const deleted = await redis.del(...keys);
                        deletedCount += deleted;
                    }
                } while (cursor !== '0');
                
                return deletedCount;
            } catch (err) {
                logger.error({ pattern, err }, 'Redis SCAN/DEL pattern failed');
            }
        }
        
        // Fallback pattern matching for local cache
        const prefix = pattern.replace(/\*$/, '');
        const keys = localCache.keys().filter(k => k.startsWith(prefix));
        return localCache.del(keys);
    },

    /**
     * Delete multiple keys
     */
    async del(key: string | string[]): Promise<number> {
        const redis = getRedisConnection();
        if (redis && redis.status === 'ready') {
            try {
                const keys = Array.isArray(key) ? key : [key];
                return await redis.del(...keys);
            } catch (err) {
                logger.error({ key, err }, 'Redis DEL multi failed');
            }
        }
        return localCache.del(key);
    },

    /**
     * Invalidate all cache entries matching a prefix
     */
    async invalidatePrefix(prefix: string): Promise<number> {
        return this.deletePattern(`${prefix}*`);
    },

    /**
     * Get stats for monitoring
     */
    async getStats() {
        const redis = getRedisConnection();
        if (redis && redis.status === 'ready') {
            const info = await redis.info('memory');
            return { type: 'redis', info };
        }
        return { type: 'local', ...localCache.getStats() };
    },

    /**
     * Flush entire cache
     */
    async flush() {
        const redis = getRedisConnection();
        if (redis && redis.status === 'ready') {
            await redis.flushdb();
        }
        localCache.flushAll();
    },

    /** Pre-defined TTL constants */
    TTL: CACHE_TTL,
};

export default cacheService;
