import 'dotenv/config';
import { startScheduler, stopScheduler } from './scheduler.js';
import { logger } from './logger.js';

// ─── Global Error Handlers ───────────────────────────────────────────────
// Prevent the worker thread from exiting on uncaught exceptions (like MikroTik API errors)
process.on('uncaughtException', (err: any) => {
    const errorMsg = String(err?.message || err || '').toLowerCase();
    const isKnownQuirk = errorMsg.includes('unknown reply') && errorMsg.includes('!empty');

    if (isKnownQuirk) {
        logger.debug({ err: errorMsg }, '[Worker] Ignoring unhandled !empty exception');
        return;
    }

    logger.error({ err: err?.message || String(err), stack: err?.stack }, '[Worker] Uncaught Exception - Continuing anyway');
});

process.on('unhandledRejection', (reason: any) => {
    const errorMsg = String(reason?.message || reason || '').toLowerCase();
    const isKnownQuirk = errorMsg.includes('unknown reply') && errorMsg.includes('!empty');

    if (isKnownQuirk) {
        logger.debug({ err: errorMsg }, '[Worker] Ignoring unhandled !empty rejection');
        return;
    }

    logger.error({ err: reason?.message || String(reason), stack: reason?.stack }, '[Worker] Unhandled Rejection - Continuing anyway');
});
// ─────────────────────────────────────────────────────────────────────────

// Ensure the process stays alive
setInterval(() => { }, 1000 * 60 * 60);

logger.info('🧵 Starting Scheduler Worker Thread');

// Handle graceful shutdown from main process
process.on('message', (msg) => {
    if (msg === 'shutdown') {
        logger.info('🛑 Scheduler Worker received shutdown signal');
        stopScheduler();
        process.exit(0);
    }
});
