import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import backupRoutes from './routes/backup.routes.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/index.js';
import { startScheduler } from './lib/scheduler.js';
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';

// Global error handlers to prevent server crashes from unhandled errors
process.on('uncaughtException', (error: Error) => {
    console.error('❌ Uncaught Exception:', error.message);
    // Don't exit - keep the server running
});

process.on('unhandledRejection', (reason: unknown) => {
    console.error('❌ Unhandled Rejection:', reason instanceof Error ? reason.message : reason);
    // Don't exit - keep the server running
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
        console.log('✅ Database migrations complete');
    } catch (error) {
        console.error('⚠️ Migration warning:', error instanceof Error ? error.message : error);
        // Continue anyway - columns might already exist
    }
}

// Create Express app
const app = express();

// Get port from environment
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
    cors({
        origin: [
            'http://localhost:5173',
            'http://localhost:5174',
            'https://mapsmonitor.genster.web.id',
            'http://10.10.70.116',
            process.env.CORS_ORIGIN || 'http://localhost:5173',
        ],
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
import { socketService } from './services/socket.service.js';

const httpServer = createServer(app);

// Initialize Socket.io
socketService.initialize(httpServer, [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://mapsmonitor.genster.web.id',
    'http://10.10.70.116',
    process.env.CORS_ORIGIN || 'http://localhost:5173',
]);

// Start server
httpServer.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`🔐 Auth available at http://localhost:${PORT}/api/auth`);
    console.log(`❤️  Health check at http://localhost:${PORT}/api/health`);
    console.log(`🔌 WebSocket server ready`);

    // Run migrations
    await runMigrations();

    // Start background router polling
    startScheduler();

    // --- DEBUG: Log all registered routes ---
    console.log('--- Registered Routes ---');
    function logRoutes(stack: any[], prefix = '') {
        stack.forEach((layer: any) => {
            if (layer.route) {
                const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
                console.log(`${methods} ${prefix}${layer.route.path}`);
            } else if (layer.name === 'router' && layer.handle.stack) {
                logRoutes(layer.handle.stack, prefix + (layer.regexp.source.replace('^\\/', '').replace('\\/?(?=\\/|$)', '')).replace('\\', ''));
            }
        });
    }
    // @ts-ignore
    logRoutes(app._router.stack);
    console.log('-------------------------');
});

export default app;

