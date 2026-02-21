import 'dotenv/config';
import { parentPort } from 'worker_threads';
import { startScheduler, stopScheduler } from './scheduler.js';
import { logger } from './logger.js';

// ─── Global Error Handlers ───────────────────────────────────────────────
// Prevent the worker thread from exiting on uncaught exceptions (like MikroTik API errors)
process.on('uncaughtException', (err) => {
    logger.error({ err }, '[Worker] Uncaught Exception - Continuing anyway');
});

process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '[Worker] Unhandled Rejection - Continuing anyway');
});
// ─────────────────────────────────────────────────────────────────────────

// Ensure the process stays alive
setInterval(() => { }, 1000 * 60 * 60);

logger.info('🧵 Starting Scheduler Worker Thread');

startScheduler().catch(err => {
    logger.error({ err }, 'Worker failed to start scheduler');
    process.exit(1);
});

// Handle graceful shutdown from main thread
if (parentPort) {
    parentPort.on('message', (msg) => {
        if (msg === 'shutdown') {
            logger.info('🛑 Scheduler Worker received shutdown signal');
            stopScheduler();
            process.exit(0);
        }
    });
}
