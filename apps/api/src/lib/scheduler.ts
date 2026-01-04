import { routerService, settingsService } from '../services';
import { alertEscalationService } from '../services/alert-escalation.service';

// Default polling interval in milliseconds (2 minutes)
const DEFAULT_POLLING_INTERVAL = 2 * 60 * 1000;

// Escalation check interval (5 minutes)
const ESCALATION_CHECK_INTERVAL = 5 * 60 * 1000;

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let escalationInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

/**
 * Get polling interval from settings or use default
 */
async function getPollingInterval(): Promise<number> {
    try {
        const setting = await settingsService.getSetting('polling_interval');
        if (setting && setting.value) {
            const minutes = parseInt(String(setting.value), 10);
            if (!isNaN(minutes) && minutes >= 1) {
                return minutes * 60 * 1000;
            }
        }
    } catch {
        // Ignore errors, use default
    }
    return DEFAULT_POLLING_INTERVAL;
}

/**
 * Poll all routers and refresh their status (including netwatch in single connection)
 * Optimized for scale: Process in parallel batches of 10
 */
async function pollAllRouters(): Promise<void> {
    if (isPolling) {
        console.log('⏳ Previous polling still in progress, skipping...');
        return;
    }

    isPolling = true;
    const startTime = Date.now();
    const BATCH_SIZE = 10; // Process 10 routers simultaneously

    try {
        const routers = await routerService.findAll();

        console.log(`🔄 Polling ${routers.length} routers (with netwatch)...`);

        let successCount = 0;
        let failCount = 0;

        // Helper function to process a single router
        const processRouter = async (router: typeof routers[0]) => {
            try {
                // Pass includeNetwatch=true to refresh router status AND sync netwatch in single connection
                await routerService.refreshRouterStatus(router.id, true);
                return { success: true };
            } catch (error) {
                console.error(`❌ Failed to poll router ${router.name}:`, error instanceof Error ? error.message : error);
                return { success: false };
            }
        };

        // Process in batches
        for (let i = 0; i < routers.length; i += BATCH_SIZE) {
            const batch = routers.slice(i, i + BATCH_SIZE);
            const promises = batch.map(router => processRouter(router));

            // Wait for this batch to complete before moving to the next
            const results = await Promise.all(promises);

            // Aggregate results
            results.forEach(res => {
                if (res.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            });
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Polling complete: ${successCount} success, ${failCount} failed (${duration}s)`);
    } catch (error) {
        console.error('❌ Polling error:', error instanceof Error ? error.message : error);
    } finally {
        isPolling = false;
    }
}

/**
 * Check for unresolved alerts that need escalation
 */
async function checkAlertEscalation(): Promise<void> {
    try {
        await alertEscalationService.checkAndEscalateAlerts();
    } catch (error) {
        console.error('❌ Escalation check error:', error instanceof Error ? error.message : error);
    }
}

/**
 * Start the background polling scheduler
 */
export async function startScheduler(): Promise<void> {
    const interval = await getPollingInterval();
    const minutes = Math.round(interval / 60000);

    console.log(`⏰ Starting router polling scheduler (every ${minutes} minute${minutes > 1 ? 's' : ''})`);
    console.log(`⏰ Starting alert escalation checker (every 5 minutes)`);

    // Run initial poll after a short delay (give server time to fully start)
    setTimeout(() => {
        pollAllRouters();
    }, 5000);

    // Run initial escalation check after 10 seconds
    setTimeout(() => {
        checkAlertEscalation();
    }, 10000);

    // Set up recurring polling
    pollingInterval = setInterval(pollAllRouters, interval);

    // Set up recurring escalation check
    escalationInterval = setInterval(checkAlertEscalation, ESCALATION_CHECK_INTERVAL);
}

/**
 * Stop the background polling scheduler
 */
export function stopScheduler(): void {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('🛑 Router polling scheduler stopped');
    }
    if (escalationInterval) {
        clearInterval(escalationInterval);
        escalationInterval = null;
        console.log('🛑 Alert escalation checker stopped');
    }
}

/**
 * Restart scheduler with new interval
 */
export async function restartScheduler(): Promise<void> {
    stopScheduler();
    await startScheduler();
}

export default {
    start: startScheduler,
    stop: stopScheduler,
    restart: restartScheduler,
    pollNow: pollAllRouters,
    checkEscalation: checkAlertEscalation,
};

