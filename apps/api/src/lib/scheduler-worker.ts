import 'dotenv/config';
import { startScheduler, stopScheduler } from './scheduler.js';
import { logger } from './logger.js';

// ─── Global Error Handlers ───────────────────────────────────────────────
// Prevent the worker thread from exiting on uncaught exceptions (like MikroTik API errors)
process.on('uncaughtException', (err: any) => {
    const errorStr = String(err?.message || err?.stack || err || '').toLowerCase();
    const isKnownQuirk =
        errorStr.includes('!empty') ||
        errorStr.includes('unknown reply') ||
        errorStr.includes('unknown tag') ||
        err?.errno === 'UNKNOWNREPLY' ||
        err?.code === 'UNKNOWNREPLY';

    if (isKnownQuirk) {
        logger.debug({ err: errorStr.substring(0, 100) }, '[Worker] Ignoring unhandled !empty exception');
        return;
    }

    logger.error({ err: err?.message || String(err), stack: err?.stack }, '[Worker] Uncaught Exception - Continuing anyway');
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
        logger.debug({ err: errorStr.substring(0, 100) }, '[Worker] Ignoring unhandled !empty rejection');
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
