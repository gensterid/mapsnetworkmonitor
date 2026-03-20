import { vi } from 'vitest';

// Global mock for child_process to prevent real system calls (pg_dump, etc.)
vi.mock('child_process', () => ({
    execFile: vi.fn((file, args, cb) => {
        if (typeof cb === 'function') cb(null, { stdout: 'mocked output' }, '');
    }),
    execFileSync: vi.fn(() => 'mocked output'),
    fork: vi.fn(() => ({
        on: vi.fn(),
        send: vi.fn(),
        kill: vi.fn(),
    })),
    spawn: vi.fn(() => ({
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
    })),
}));

// Global mock for Redis client
vi.mock('../lib/redis-client.js', () => ({
    getRedisConnection: vi.fn(() => ({
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        keys: vi.fn(),
        scan: vi.fn(),
        status: 'ready',
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue('OK'),
    })),
    createRedisConnection: vi.fn(() => ({
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue('OK'),
    })),
    closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

// Global mock for Database to prevent real connections
vi.mock('../db/index.js', () => ({
    db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue([]),
        transaction: vi.fn((cb) => cb({
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([]),
        })),
    },
}));

// Mock all services globally to prevent background tasks from hitting real infrastructure
const mockBackupService = {
    automatedBackup: vi.fn().mockResolvedValue('test-backup.sql'),
    exportDatabase: vi.fn().mockResolvedValue('test.sql'),
    listBackups: vi.fn().mockResolvedValue([]),
    deleteBackup: vi.fn().mockResolvedValue(undefined),
    restoreFromHistory: vi.fn().mockResolvedValue(undefined),
    importDatabase: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../services/backup.service.js', () => ({
    BackupService: vi.fn().mockImplementation(() => mockBackupService),
    backupService: mockBackupService,
}));

vi.mock('../services/index.js', () => ({
    routerService: { findAll: vi.fn().mockResolvedValue([]), refreshRouterStatus: vi.fn() },
    settingsService: { getSettingValue: vi.fn().mockResolvedValue(true) },
    oltService: { findAll: vi.fn().mockResolvedValue([]) },
    genieacsService: { syncMetadata: vi.fn().mockResolvedValue({}), getDashboardStats: vi.fn().mockResolvedValue({}) },
    backupService: mockBackupService,
    routerSyncQueue: { addBulk: vi.fn().mockResolvedValue([]) },
    oltSyncQueue: { add: vi.fn().mockResolvedValue({}) },
    startQueueWorker: vi.fn(),
    stopQueueWorker: vi.fn(),
    partitionService: {
        ensurePartitionsExist: vi.fn().mockResolvedValue(undefined),
    },
    metricsService: { 
        updateSystemGauges: vi.fn().mockResolvedValue(undefined), 
        updateQueueGauges: vi.fn().mockResolvedValue(undefined),
        httpRequestTotal: { inc: vi.fn() },
        httpRequestDuration: { observe: vi.fn() }
    },
}));

// Mock logger to keep test output clean
vi.mock('../lib/logger.js', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        fatal: vi.fn(),
    },
}));
