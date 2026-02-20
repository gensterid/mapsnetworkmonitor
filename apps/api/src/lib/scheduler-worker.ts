import { parentPort } from 'worker_threads';
import { startScheduler, stopScheduler } from './scheduler.js';
import { logger } from './logger.js';

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
