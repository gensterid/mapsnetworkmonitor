// Simple in-memory cache utility
// Used to reduce database load for frequently accessed, slowly changing data (like the Map topology)

interface CacheEntry<T> {
    data: T;
    expiry: number;
}

class CacheService {
    private cache: Map<string, CacheEntry<any>> = new Map();

    /**
     * Set a value in the cache with a Time-To-Live (TTL)
     * @param key Unique identifier for the cached data
     * @param data The data to cache
     * @param ttlMs Time-to-live in milliseconds
     */
    set<T>(key: string, data: T, ttlMs: number): void {
        this.cache.set(key, {
            data,
            expiry: Date.now() + ttlMs,
        });
    }

    /**
     * Get a value from the cache if it exists and hasn't expired
     * @param key Unique identifier for the cached data
     * @returns The cached data, or null if not found/expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Delete a specific key from the cache
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear the entire cache
     */
    clear(): void {
        this.cache.clear();
    }
}

export const cacheService = new CacheService();
export default cacheService;
