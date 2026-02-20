import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import routes from './routes/index.js';
import backupRoutes from './routes/backup.routes.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/index.js';
import { startScheduler, stopScheduler } from './lib/scheduler.js';
import { logger } from './lib/logger.js';
import { socketService } from './services/socket.service.js';
import { corsMiddleware, allowedOrigins } from './config/cors.js';
import { securityMiddleware, apiLimiter, authLimiter } from './config/security.js';
import { runMigrations } from './db/migrate.js';

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
        if (process.env.NODE_ENV === 'production') {
            logger.fatal({ issues }, '🚨 FATAL: Insecure configuration detected. Server cannot start in production with default secrets.');
            process.exit(1);
        } else {
            logger.warn({ issues }, '⚠️ WARNING: Insecure configuration detected. Fix before deploying to production.');
        }
    }
}

validateSecrets();
// ─────────────────────────────────────────────────────────────────────────

// Global error handlers
process.on('uncaughtException', (error: Error) => {
    logger.error({ err: error }, 'Uncaught Exception');
    if (process.env.NODE_ENV === 'production') process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
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

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Start server
httpServer.listen(Number(PORT), '0.0.0.0', async () => {
    logger.info(`🚀 Server running on http://0.0.0.0:${PORT}`);

    // Run migrations
    await runMigrations();

    // Start background scheduler
    startScheduler();
});

// Graceful Shutdown
const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    httpServer.close(async () => {
        try {
            stopScheduler();
            await socketService.stopAll();
            logger.info('✅ Graceful shutdown complete');
            process.exit(0);
        } catch (err) {
            logger.error({ err }, 'Error during graceful shutdown');
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

