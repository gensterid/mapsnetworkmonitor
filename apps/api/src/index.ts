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

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`🔐 Auth available at http://localhost:${PORT}/api/auth`);
    console.log(`❤️  Health check at http://localhost:${PORT}/api/health`);

    // Run migrations
    await runMigrations();

    // Start background router polling
    startScheduler();
});

export default app;

