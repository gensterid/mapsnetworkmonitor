import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cacheService } from '../../lib/cache.js';
import * as redisClient from '../../lib/redis-client.js';

// Mock Redis connection
const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    scan: vi.fn(),
    status: 'ready',
};

vi.mock('../../lib/redis-client.js', () => ({
    getRedisConnection: vi.fn(),
}));

vi.mock('../../lib/logger.js', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('CacheService Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default to Redis connected
        (redisClient.getRedisConnection as any).mockReturnValue(mockRedis);
    });

    describe('get()', () => {
        it('should return value from Redis if connected', async () => {
            const testData = { foo: 'bar' };
            mockRedis.get.mockResolvedValue(JSON.stringify(testData));

            const result = await cacheService.get('test-key');
            expect(result).toEqual(testData);
            expect(mockRedis.get).toHaveBeenCalledWith('test-key');
        });

        it('should return undefined if Redis returns null', async () => {
            mockRedis.get.mockResolvedValue(null);

            const result = await cacheService.get('missing-key');
            expect(result).toBeUndefined();
        });

        it('should fallback to NodeCache if Redis is unavailable', async () => {
            (redisClient.getRedisConnection as any).mockReturnValue(null);
            
            // Set in local cache first
            await cacheService.set('local-key', 'local-value');
            
            const result = await cacheService.get('local-key');
            expect(result).toBe('local-value');
            expect(mockRedis.get).not.toHaveBeenCalled();
        });
    });

    describe('set()', () => {
        it('should set value in Redis with TTL', async () => {
            await cacheService.set('set-key', { a: 1 }, 100);
            expect(mockRedis.set).toHaveBeenCalledWith('set-key', JSON.stringify({ a: 1 }), 'EX', 100);
        });

        it('should set value in NodeCache if Redis is unavailable', async () => {
            (redisClient.getRedisConnection as any).mockReturnValue(null);
            await cacheService.set('local-set', 'val');
            
            const result = await cacheService.get('local-set');
            expect(result).toBe('val');
        });
    });

    describe('delete()', () => {
        it('should delete from Redis', async () => {
            await cacheService.delete('del-key');
            expect(mockRedis.del).toHaveBeenCalledWith('del-key');
        });
    });

    describe('invalidatePrefix()', () => {
        it('should delete multiple keys by pattern using scan', async () => {
            // Mock scan behavior: first call returns keys and '0' as next cursor
            mockRedis.scan = vi.fn().mockResolvedValue(['0', ['prefix:1', 'prefix:2']]);
            mockRedis.del = vi.fn().mockResolvedValue(2);

            await cacheService.invalidatePrefix('prefix:');
            
            expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'prefix:*', 'COUNT', 100);
            expect(mockRedis.del).toHaveBeenCalledWith('prefix:1', 'prefix:2');
        });
    });
});
