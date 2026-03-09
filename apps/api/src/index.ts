import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import routes from './routes/index.js';
import backupRoutes from './routes/backup.routes.js';
import { stopScheduler } from './lib/scheduler.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/index.js';
import { logger } from './lib/logger.js';
import { socketService } from './services/socket.service.js';
import { corsMiddleware, allowedOrigins } from './config/cors.js';
import { securityMiddleware, apiLimiter, authLimiter } from './config/security.js';
import { runMigrations } from './db/migrate.js';
import { fork, ChildProcess } from 'child_process';
import { join, extname, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { eventEmitter } from './services/event-emitter.service.js';
import { createRequire } from 'module';
import routerBackupRoutes from './routes/router-backup.routes.js';

const REQUIRE = createRequire(import.meta.url);

// ─── Startup Security Validation ────────────────────────────────────────
const INSECURE_DEFAULTS = [
    'your-secret-key-change-in-production',
    'your-32-byte-encryption-key-here',
    'change-me',
    'secret',
];

function validateSecrets(): void {
    const issues: string[] = [];

    if (!process.env.BETTER_AUTH_SECRET || INSECURE_DEFAULTS.includes(process.env.BETTER_AUTH_SECRET)) {
        issues.push('BETTER_AUTH_SECRET is missing or using an insecure default value');
    }
    if (!process.env.ENCRYPTION_KEY || INSECURE_DEFAULTS.includes(process.env.ENCRYPTION_KEY)) {
        issues.push('ENCRYPTION_KEY is missing or using an insecure default value');
    }
    if (!process.env.DATABASE_URL) {
        issues.push('DATABASE_URL is not set');
    }

    if (issues.length > 0) {
        const isMissing = issues.some(i => i.includes('is missing'));
        if (process.env.NODE_ENV === 'production') {
            if (isMissing) {
                logger.fatal({ issues }, '🚨 FATAL: Missing configuration detected. Server cannot start in production without secrets.');
                process.exit(1);
            } else {
                logger.error({ issues }, '⚠️ CRITICAL: Insecure configuration detected. Using default secrets in production is HIGHLY INSECURE. Please update your .env file.');
                // We no longer exit on default values to allow initial setup/testing, but it's strongly discouraged.
            }
        } else {
            logger.warn({ issues }, '⚠️ WARNING: Insecure configuration detected. Fix before deploying to production.');
        }
    }
}

validateSecrets();
// ─────────────────────────────────────────────────────────────────────────

// Global error handlers
process.on('uncaughtException', (error: any) => {
    const errorStr = String(error?.message || error?.stack || error || '').toLowerCase();
    const isKnownQuirk =
        errorStr.includes('!empty') ||
        errorStr.includes('unknown reply') ||
        errorStr.includes('unknown tag') ||
        error?.errno === 'UNKNOWNREPLY' ||
        error?.code === 'UNKNOWNREPLY';

    if (isKnownQuirk) {
        logger.debug({ err: errorStr.substring(0, 100) }, '[RouterOS API Compatibility] Ignoring unhandled !empty exception');
        return;
    }

    logger.error({ err: error }, 'Uncaught Exception');
    if (process.env.NODE_ENV === 'production') process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
    const errorStr = String(reason?.message || reason?.stack || reason || '').toLowerCase();
    const isKnownQuirk =
        errorStr.includes('!empty') ||
        errorStr.includes('unknown reply') ||
        errorStr.includes('unknown tag') ||
        reason?.errno === 'UNKNOWNREPLY' ||
        reason?.code === 'UNKNOWNREPLY';

    if (isKnownQuirk) {
        logger.debug({ err: errorStr.substring(0, 100) }, '[RouterOS API Compatibility] Ignoring unhandled !empty rejection');
        return;
    }

    logger.error({ reason }, 'Unhandled Rejection');
});

const app = express();

// Enable Gzip compression
app.use(compression({
    filter: (req, res) => {
        if (req.originalUrl?.includes('/api/events')) return false;
        return compression.filter(req, res);
    }
}));

// Trust proxy for rate limiting behind Nginx
app.set('trust proxy', 1);

// Security & CORS
app.use(corsMiddleware);
app.use(securityMiddleware);

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// MikroTik Backup upload routes MUST be before global body parsers
// to allow express.raw() to handle binary data correctly.
app.use('/api/router-backups', routerBackupRoutes);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (no auth required)
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
    });
});

// API routes
app.use('/api', routes);
app.use('/api/backup', backupRoutes);

// Error handling
app.use(notFoundMiddleware);
app.use(errorMiddleware);

// Create HTTP server for Socket.io
import { createServer } from 'http';
const httpServer = createServer(app);

// Initialize Socket.io
socketService.initialize(httpServer, allowedOrigins);

const PORT = process.env.PORT || 3001;

// Worker Thread setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let schedulerProcess: ChildProcess | null = null;

function startSchedulerWorker() {
    const isProd = process.env.NODE_ENV === 'production';
    let baseDir = __dirname;
    let ext = extname(__filename);

    if (isProd) {
        ext = '.js';
        if (baseDir.includes(join('apps', 'api', 'src'))) {
            baseDir = baseDir.replace(join('apps', 'api', 'src'), join('apps', 'api', 'dist'));
        } else if (baseDir.endsWith('src')) {
            baseDir = baseDir.replace(/src$/, 'dist');
        }
    }

    const workerPath = join(baseDir, 'lib', 'scheduler-worker' + ext);
    logger.info({ workerPath, isProd }, '🧵 Spawning scheduler background process');

    schedulerProcess = fork(workerPath, [], {
        execArgv: isProd ? [] : ['--import', 'tsx'],
        stdio: 'inherit'
    });

    schedulerProcess.on('message', (msg: any) => {
        try {
            if (msg.type === 'sse_broadcast') {
                eventEmitter.broadcast(msg.eventType, msg.data);
            } else if (msg.type === 'sse_broadcast_users') {
                eventEmitter.broadcastToUsers(msg.eventType, msg.data, msg.allowedUserIds);
            }
        } catch (err: any) {
            logger.error({ err: err?.message || String(err), msg }, 'Error handling worker message in main thread');
        }
    });

    schedulerProcess.on('error', (err) => logger.error({ err: err?.message || String(err) }, 'Scheduler process error'));
    schedulerProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            logger.error(new Error(`Scheduler process stopped with exit code ${code}`));
            setTimeout(() => startSchedulerWorker(), 5000);
        }
    });
}

// Start server
httpServer.listen(Number(PORT), '0.0.0.0', async () => {
    logger.info(`🚀 Server running on http://0.0.0.0:${PORT}`);

    // Run migrations
    await runMigrations();

    // Start background scheduler in separate thread
    startSchedulerWorker();
});

// Graceful Shutdown
const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    httpServer.close(async () => {
        try {
            if (schedulerProcess) {
                schedulerProcess.send('shutdown');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            await socketService.stopAll();
            logger.info('✅ Graceful shutdown complete');
            process.exit(0);
        } catch (err: any) {
            logger.error({ err: err?.message || String(err) }, 'Error during graceful shutdown');
            process.exit(1);
        }
    });

    setTimeout(() => {
        logger.error('Forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

