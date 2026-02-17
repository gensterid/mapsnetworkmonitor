import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import backupRoutes from './routes/backup.routes.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/index.js';
import { startScheduler, stopScheduler } from './lib/scheduler.js';
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
import { logger } from './lib/logger.js';
import { socketService } from './services/socket.service.js';

// Global error handlers to prevent server crashes from unhandled errors
process.on('uncaughtException', (error: Error) => {
    logger.error({ err: error }, 'Uncaught Exception');
    // In production, we might want to exit after logging
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'Unhandled Rejection');
});

/**
 * Run database migrations for new features
 */
async function runMigrations() {
    try {
        // Add escalation columns if they don't exist
        await db.execute(sql`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'alerts' AND column_name = 'escalation_level'
                ) THEN
                    ALTER TABLE alerts ADD COLUMN escalation_level INTEGER DEFAULT 0 NOT NULL;
                    RAISE NOTICE 'Added escalation_level column';
                END IF;
                
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'alerts' AND column_name = 'last_escalated_at'
                ) THEN
                    ALTER TABLE alerts ADD COLUMN last_escalated_at TIMESTAMP;
                    RAISE NOTICE 'Added last_escalated_at column';
                END IF;

                -- Add PPPoE coordinates columns
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'pppoe_sessions' AND column_name = 'latitude'
                ) THEN
                    ALTER TABLE pppoe_sessions ADD COLUMN latitude TEXT;
                    RAISE NOTICE 'Added latitude column to pppoe_sessions';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'pppoe_sessions' AND column_name = 'longitude'
                ) THEN
                    ALTER TABLE pppoe_sessions ADD COLUMN longitude TEXT;
                    RAISE NOTICE 'Added longitude column to pppoe_sessions';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'pppoe_sessions' AND column_name = 'waypoints'
                ) THEN
                    ALTER TABLE pppoe_sessions ADD COLUMN waypoints TEXT;
                    RAISE NOTICE 'Added waypoints column to pppoe_sessions';
                END IF;

                -- Add animation_style to users
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'animation_style'
                ) THEN
                    ALTER TABLE users ADD COLUMN animation_style TEXT DEFAULT 'default';
                    RAISE NOTICE 'Added animation_style column to users';
                END IF;

                -- Add traffic mapping columns to router_netwatch
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'router_netwatch' AND column_name = 'target_interface'
                ) THEN
                    ALTER TABLE router_netwatch ADD COLUMN target_interface TEXT;
                    RAISE NOTICE 'Added target_interface column to router_netwatch';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'router_netwatch' AND column_name = 'tx_rate'
                ) THEN
                    ALTER TABLE router_netwatch ADD COLUMN tx_rate BIGINT DEFAULT 0;
                    RAISE NOTICE 'Added tx_rate column to router_netwatch';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'router_netwatch' AND column_name = 'rx_rate'
                ) THEN
                    ALTER TABLE router_netwatch ADD COLUMN rx_rate BIGINT DEFAULT 0;
                    RAISE NOTICE 'Added rx_rate column to router_netwatch';
                END IF;

                -- Add GenieACS columns to routers
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'routers' AND column_name = 'use_genieacs'
                ) THEN
                    ALTER TABLE routers ADD COLUMN use_genieacs BOOLEAN DEFAULT false NOT NULL;
                    RAISE NOTICE 'Added use_genieacs column to routers';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'routers' AND column_name = 'genieacs_url'
                ) THEN
                    ALTER TABLE routers ADD COLUMN genieacs_url TEXT;
                    RAISE NOTICE 'Added genieacs_url column to routers';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'routers' AND column_name = 'genieacs_username'
                ) THEN
                    ALTER TABLE routers ADD COLUMN genieacs_username TEXT;
                    RAISE NOTICE 'Added genieacs_username column to routers';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'routers' AND column_name = 'genieacs_password_encrypted'
                ) THEN
                    ALTER TABLE routers ADD COLUMN genieacs_password_encrypted TEXT;
                    RAISE NOTICE 'Added genieacs_password_encrypted column to routers';
                END IF;

                -- Add OLT status columns
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'olts' AND column_name = 'last_snmp_status'
                ) THEN
                    ALTER TABLE olts ADD COLUMN last_snmp_status TEXT;
                    RAISE NOTICE 'Added last_snmp_status column to olts';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'olts' AND column_name = 'last_web_status'
                ) THEN
                    ALTER TABLE olts ADD COLUMN last_web_status TEXT;
                    RAISE NOTICE 'Added last_web_status column to olts';
                END IF;
            END $$;
        `);
        logger.info('✅ Database migrations complete');
    } catch (error) {
        logger.warn({ err: error }, 'Migration warning');
        // Continue anyway - columns might already exist
    }
}

// Create Express app
const app = express();

// Trust proxy for rate limiting behind Nginx/Proxmox
app.set('trust proxy', true);

// Get port from environment
const PORT = process.env.PORT || 3001;

// Rate limiting
import { rateLimit } from 'express-rate-limit';

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'Too many requests from this IP, please try again after 15 minutes',
    },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 auth attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too Many Requests',
        message: 'Too many login attempts, please try again after 15 minutes',
    },
});

// Security middleware
app.use(helmet());

// Apply rate limiters
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173'];

app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', routes);
app.use('/api/backup', backupRoutes);

// 404 handler
app.use(notFoundMiddleware);

// Error handler
app.use(errorMiddleware);

// Create HTTP server for Socket.io
import { createServer } from 'http';

const httpServer = createServer(app);

// Initialize Socket.io
socketService.initialize(httpServer, allowedOrigins);

// Start server
httpServer.listen(PORT, async () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`📡 API available at http://localhost:${PORT}/api`);
    logger.info(`🔐 Auth available at http://localhost:${PORT}/api/auth`);
    logger.info(`❤️  Health check at http://localhost:${PORT}/api/health`);
    logger.info(`🔌 WebSocket server ready`);

    // Run migrations
    await runMigrations();

    // Start background router polling
    startScheduler();
});

// Graceful Shutdown
const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    httpServer.close(async () => {
        logger.info('HTTP server closed');

        try {
            // Stop background scheduler
            stopScheduler();

            // Stop all socket polling
            await socketService.stopAll();

            logger.info('✅ Graceful shutdown complete');
            process.exit(0);
        } catch (err) {
            logger.error({ err }, 'Error during graceful shutdown');
            process.exit(1);
        }
    });

    // Force close after 10s
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

