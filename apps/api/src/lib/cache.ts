/**
 * In-memory cache layer using node-cache.
 * Provides typed get/set/delete for hot data paths.
 * 
 * Cache is local to the process — suitable for single-instance deployments.
 * For horizontal scaling, replace with Redis.
 */
import NodeCache from 'node-cache';
import { logger } from './logger.js';

// Default TTLs (in seconds)
const CACHE_TTL = {
    ROUTER_LIST: 30,     // Router list changes infrequently
    ROUTER_DETAIL: 60,   // Individual router cache
    SETTINGS: 60,        // Settings almost never change
    NETWATCH_STATS: 15,  // Netwatch status updates via scheduler
    DASHBOARD: 20,       // Dashboard aggregation
    GENIEACS_DEVICES: 30, // GenieACS device list
    GENIEACS_DEVICE: 60,  // Individual device detail
};

const cache = new NodeCache({
    stdTTL: 30,          // Default TTL: 30 seconds
    checkperiod: 60,     // Cleanup check every 60 seconds
    useClones: false,    // Don't clone objects (faster, but be careful with mutations)
    maxKeys: 1000,       // Prevent memory leak
});

cache.on('expired', (key) => {
    logger.debug({ key }, 'Cache entry expired');
});

/**
 * Cache service with typed helpers.
 * Method names match the API used in router.service.ts and other services.
 */
export const cacheService = {
    /**
     * Get a cached value by key
     */
    get<T>(key: string): T | undefined {
        return cache.get<T>(key);
    },

    /**
     * Set a cached value with optional TTL (in seconds)
     */
    set<T>(key: string, value: T, ttl?: number): boolean {
        return cache.set(key, value, ttl ?? 30);
    },

    /**
     * Delete a specific cached key
     */
    delete(key: string): number {
        return cache.del(key);
    },

    /**
     * Delete all cache entries matching a glob-like pattern (e.g., "routers:list:*")
     * Converts wildcards to prefix-based matching for simplicity.
     */
    deletePattern(pattern: string): number {
        const prefix = pattern.replace(/\*$/, '');
        const keys = cache.keys().filter(k => k.startsWith(prefix));
        return cache.del(keys);
    },

    /**
     * Delete multiple keys
     */
    del(key: string | string[]): number {
        return cache.del(key);
    },

    /**
     * Invalidate all cache entries matching a prefix
     */
    invalidatePrefix(prefix: string): number {
        const keys = cache.keys().filter(k => k.startsWith(prefix));
        return cache.del(keys);
    },

    /**
     * Get stats for monitoring
     */
    getStats() {
        return cache.getStats();
    },

    /**
     * Flush entire cache
     */
    flush() {
        cache.flushAll();
    },

    /** Pre-defined TTL constants */
    TTL: CACHE_TTL,
};

export default cacheService;
