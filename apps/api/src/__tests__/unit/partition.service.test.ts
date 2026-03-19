import { describe, it, expect, vi, beforeEach } from 'vitest';
import { partitionService } from '../../services/db/partition.service.js';
import { db } from '../../db/index.js';

// Mock DB
vi.mock('../../db/index.js', () => ({
    db: {
        execute: vi.fn(),
    },
}));

vi.mock('../../lib/logger.js', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('PartitionService Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create initial partitions for current and next month', async () => {
        // Mock successful execution - empty array means partition doesn't exist
        (db.execute as any).mockResolvedValue([]);

        await partitionService.ensurePartitionsExist();

        // 3 tables * 2 months * 2 calls (check + create) = 12 calls
        expect(db.execute).toHaveBeenCalledTimes(12);
    });

    it('should log error instead of throwing if database execution fails', async () => {
        (db.execute as any).mockRejectedValue(new Error('DB Error'));
        
        // ensurePartitionsExist catches errors internally
        await expect(partitionService.ensurePartitionsExist()).resolves.not.toThrow();
    });
});
