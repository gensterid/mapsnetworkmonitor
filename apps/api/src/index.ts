import 'dotenv/config';
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// ─── Sentry Initialization ──────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [
            nodeProfilingIntegration(),
        ],
        // Performance Monitoring
        tracesSampleRate: 0.1, // Reduce to 10% sampling in production
        // Set sampling rate for profiling - this is relative to tracesSampleRate
        profilesSampleRate: 0.1,
    });
}
// ─────────────────────────────────────────────────────────────────────────

import { validateEnv } from './config/env.js';
validateEnv(); // Early validation
import express from 'express';
import compression from 'compression';
import routes from './routes/index.js';
import backupRoutes from './routes/backup.routes.js';
import { stopScheduler } from './lib/scheduler.js';
import { errorMiddleware, notFoundMiddleware, sanitizeMiddleware } from './middleware/index.js';
import { logger } from './lib/logger.js';
import { socketService } from './services/socket.service.js';
import { corsMiddleware, allowedOrigins } from './config/cors.js';
import { securityMiddleware, apiLimiter, authLimiter } from './config/security.js';
import { runDrizzleMigrations } from './db/migrate-drizzle.js';
import { fork, ChildProcess } from 'child_process';
import { join, extname, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { eventEmitter } from './services/event-emitter.service.js';
import { createRequire } from 'module';
import routerBackupRoutes from './routes/router-backup.routes.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { metricsService } from './services/metrics.service.js';

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

// Prometheus Metrics Middleware (Track all requests)
app.use(metricsMiddleware);

// Early sanitization for Query and Params (to protect routes that bypass global body parser)
app.use((req, _res, next) => {
    sanitizeMiddleware(req, _res, next);
});

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// MikroTik Backup upload routes MUST be before global body parsers
// to allow express.raw() to handle binary data correctly.
app.use('/api/router-backups', routerBackupRoutes);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// Global sanitization after body parsing (to catch JSON/URL-encoded bodies)
app.use(sanitizeMiddleware);

// Health check endpoint (no auth required)
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});

// Prometheus Metrics endpoint (requires localhost or Bearer token)
app.get('/api/metrics', async (req, res) => {
    try {
        // Allow Prometheus scraping via Bearer token
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        // Use a dedicated metrics token if provided, otherwise fallback to main secret (deprecated)
        const metricsToken = process.env.METRICS_BEARER_TOKEN || process.env.BETTER_AUTH_SECRET;
        const isTokenAuth = bearerToken && bearerToken === metricsToken;
        
        if (bearerToken === process.env.BETTER_AUTH_SECRET && process.env.METRICS_BEARER_TOKEN) {
            logger.warn('⚠️ Metrics access using BETTER_AUTH_SECRET detected. Please switch to the dedicated METRICS_BEARER_TOKEN.');
        }

        // Allow localhost/internal network without auth (Prometheus on same host)
        const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';

        if (!isTokenAuth && !isLocalhost) {
            res.status(401).json({ error: 'Unauthorized', message: 'Metrics endpoint requires authentication' });
            return;
        }

        res.set('Content-Type', metricsService.getContentType());
        res.end(await metricsService.getMetrics());
    } catch (err) {
        res.status(500).end(err);
    }
});

// Periodic Metrics Update (once per minute in main process)
setInterval(async () => {
    try {
        await metricsService.updateSystemGauges();
        await metricsService.updateQueueGauges();
    } catch (err) {
        logger.error({ err }, 'Failed to update Prometheus metrics Gauges in main thread');
    }
}, 60 * 1000);

// Initial update
metricsService.updateSystemGauges();
metricsService.updateQueueGauges();

// API routes
app.use('/api', routes);
app.use('/api/backup', backupRoutes);

// Sentry Error Handler (must be before other error middlewares)
if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
}

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

// ─── Startup Health Checks ──────────────────────────────────────────────
import { getRedisConnection } from './lib/redis-client.js';
import postgres from 'postgres';

async function validateInfrastructure(): Promise<void> {
    // 1. Redis Check
    const redis = getRedisConnection();
    if (redis) {
        try {
            const pong = await Promise.race([
                redis.ping(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);
            if (pong === 'PONG') logger.info('🍦 Redis connectivity verified');
        } catch (err: any) {
            logger.error({ err: err.message }, '⚠️ CRITICAL: Redis is unreachable. Background polling will NOT function.');
        }
    }

    // 2. PostgreSQL Check
    try {
        const sql = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 5 });
        await sql`SELECT 1`;
        await sql.end();
        logger.info('🐘 PostgreSQL connectivity verified');
    } catch (err: any) {
        logger.error({ err: err.message }, '⚠️ CRITICAL: PostgreSQL is unreachable. Application might fail to start or operate correctly.');
        if (process.env.NODE_ENV === 'production') {
            logger.fatal('🚨 Database connection required for production. Exiting.');
            process.exit(1);
        }
    }
}
// ─────────────────────────────────────────────────────────────────────────

// Start server
httpServer.listen(Number(PORT), '0.0.0.0', async () => {
    logger.info(`🚀 Server running on http://0.0.0.0:${PORT}`);

    // Verify infrastructure before starting background tasks
    await validateInfrastructure();

    // Run migrations (Drizzle versioned) - Non-blocking to prevent scheduler stall
    runDrizzleMigrations()
        .then(async () => {
            // After migrations, boot VPN connection manager (Phase 3.3).
            // Late import supaya tidak load saat unit test atau migration-only run.
            try {
                const { vpnConnectionManager } = await import('./services/vpn/connection-manager.service.js');
                await vpnConnectionManager.start();
            } catch (err: any) {
                logger.error({ err: err?.message || String(err) }, '⚠️ VPN connection manager failed to start');
            }
        })
        .catch(err => {
            logger.error({ err: err?.message || String(err) }, '⚠️ Drizzle Migration failed at startup.');
        });

    // Start background scheduler in separate thread
    startSchedulerWorker();
 });

// Graceful Shutdown
const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    // Stop accepting new connections and actively close existing ones (SSE/Keep-alive)
    if (typeof httpServer.closeAllConnections === 'function') {
        logger.info('🔌 Forcefully closing all HTTP and SSE connections...');
        httpServer.closeAllConnections();
    }

    httpServer.close(async () => {
        try {
            // 1. Stop scheduler worker
            if (schedulerProcess) {
                logger.info('🛑 Stopping scheduler worker...');
                schedulerProcess.send('shutdown');

                // Fast-wait for worker to exit or force ignore after 2s
                const workerExitPromise = new Promise(resolve => schedulerProcess!.on('exit', resolve));
                await Promise.race([workerExitPromise, new Promise(resolve => setTimeout(resolve, 2000))]);
            }

            // 1b. Stop VPN connection manager (best-effort)
            try {
                const { vpnConnectionManager } = await import('./services/vpn/connection-manager.service.js');
                await vpnConnectionManager.stop();
            } catch (err: any) {
                logger.warn({ err: err?.message || String(err) }, 'VPN manager stop failed during shutdown');
            }

            // 2. Stop Socket.io
            await socketService.stopAll();

            // 3. Stop Redis
            const { closeRedisConnection } = await import('./lib/redis-client.js');
            await closeRedisConnection();

            logger.info('✅ Graceful shutdown complete');
            process.exit(0);
        } catch (err: any) {
            logger.error({ err: err?.message || String(err) }, 'Error during graceful shutdown');
            process.exit(1);
        }
    });

    // Force exit if shutdown takes too long (5s - faster than PM2 timeout)
    setTimeout(() => {
        logger.error('Forcefully shutting down');
        process.exit(1);
    }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

