import { routerService, settingsService } from '../services/index.js';
import { alertEscalationService } from '../services/alert-escalation.service.js';
import { db } from '../db/index.js';
import { routerNetwatch } from '../db/schema/index.js';
import { count } from 'drizzle-orm';

// Default polling interval in milliseconds (2 minutes)
const DEFAULT_POLLING_INTERVAL = 2 * 60 * 1000;

// Escalation check interval (5 minutes)
const ESCALATION_CHECK_INTERVAL = 5 * 60 * 1000;

// Per-router timeout (60 seconds)
const ROUTER_TIMEOUT = 60 * 1000;

// Global polling timeout (10 minutes) - safety net to prevent stuck polling
const GLOBAL_POLLING_TIMEOUT = 10 * 60 * 1000;

// Adaptive scaling configuration
interface ScalingConfig {
    intervalMs: number;
    batchSize: number;
    strategy: string;
}

const SCALING_TIERS: { maxDevices: number; config: ScalingConfig }[] = [
    { maxDevices: 50, config: { intervalMs: 30 * 1000, batchSize: 10, strategy: 'Full check' } },
    { maxDevices: 200, config: { intervalMs: 60 * 1000, batchSize: 5, strategy: 'Batching' } },
    { maxDevices: 500, config: { intervalMs: 120 * 1000, batchSize: 3, strategy: 'Priority + Batching' } },
    { maxDevices: Infinity, config: { intervalMs: 300 * 1000, batchSize: 2, strategy: 'Sampling + Alert only' } },
];

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let escalationInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let pollingStartTime: number | null = null;
let currentScalingConfig: ScalingConfig = SCALING_TIERS[0].config;
let lastNetwatchCount = 0;

/**
 * Count total netwatch entries across all routers
 */
async function getTotalNetwatchCount(): Promise<number> {
    try {
        const result = await db.select({ count: count() }).from(routerNetwatch);
        return result[0]?.count || 0;
    } catch {
        return 0;
    }
}

/**
 * Determine scaling config based on device count
 */
function getScalingConfig(deviceCount: number): ScalingConfig {
    for (const tier of SCALING_TIERS) {
        if (deviceCount <= tier.maxDevices) {
            return tier.config;
        }
    }
    return SCALING_TIERS[SCALING_TIERS.length - 1].config;
}

/**
 * Get polling interval from settings or use adaptive scaling
 */
async function getPollingInterval(): Promise<number> {
    try {
        // Check for manual override in settings
        const setting = await settingsService.getSetting('polling_interval');
        if (setting && setting.value) {
            const minutes = parseInt(String(setting.value), 10);
            if (!isNaN(minutes) && minutes >= 1) {
                return minutes * 60 * 1000;
            }
        }

        // Use adaptive scaling based on netwatch count
        const netwatchCount = await getTotalNetwatchCount();
        lastNetwatchCount = netwatchCount;
        currentScalingConfig = getScalingConfig(netwatchCount);

        console.log(`📊 Adaptive scaling: ${netwatchCount} devices → ${currentScalingConfig.intervalMs / 1000}s interval, batch=${currentScalingConfig.batchSize} (${currentScalingConfig.strategy})`);

        return currentScalingConfig.intervalMs;
    } catch {
        // Ignore errors, use default
    }
    return DEFAULT_POLLING_INTERVAL;
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
}

/**
 * Check if polling has been stuck for too long and force reset if needed
 */
function checkPollingStuck(): void {
    if (isPolling && pollingStartTime) {
        const elapsed = Date.now() - pollingStartTime;
        if (elapsed > GLOBAL_POLLING_TIMEOUT) {
            console.warn(`⚠️ Polling stuck for ${Math.round(elapsed / 1000)}s, force resetting...`);
            isPolling = false;
            pollingStartTime = null;
        }
    }
}

/**
 * Poll all routers and refresh their status (including netwatch in single connection)
 * Optimized for scale: Process in parallel batches of 10
 */
async function pollAllRouters(): Promise<void> {
    // Check if previous polling is stuck
    checkPollingStuck();

    if (isPolling) {
        console.log('⏳ Previous polling still in progress, skipping...');
        return;
    }

    isPolling = true;
    pollingStartTime = Date.now();
    const date = new Date(pollingStartTime);

    // Use adaptive batch size from scaling config
    const BATCH_SIZE = currentScalingConfig.batchSize;

    try {
        const routers = await routerService.findAll();

        console.log(`🔄 Polling ${routers.length} routers (${lastNetwatchCount} netwatch, batch=${BATCH_SIZE})...`);

        let successCount = 0;
        let failCount = 0;
        let timeoutCount = 0;

        // Helper function to process a single router with timeout
        const processRouter = async (router: typeof routers[0]) => {
            try {
                // Determine if this is a full sync poll (every 5 polling cycles)
                const isFullSync = (date.getMinutes() % 5 === 0);

                // Wrap refreshRouterStatus with timeout
                await withTimeout(
                    routerService.refreshRouterStatus(router.id, true, isFullSync),
                    ROUTER_TIMEOUT,
                    `Timeout polling router ${router.name}`
                );
                return { success: true, timeout: false };
            } catch (error) {
                const isTimeout = error instanceof Error && error.message.includes('Timeout');
                if (isTimeout) {
                    console.error(`⏰ Timeout polling router ${router.name} (>${ROUTER_TIMEOUT / 1000}s)`);
                } else {
                    console.error(`❌ Failed to poll router ${router.name}:`, error instanceof Error ? error.message : error);
                }
                return { success: false, timeout: isTimeout };
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
                } else if (res.timeout) {
                    timeoutCount++;
                } else {
                    failCount++;
                }
            });
        }

        const duration = ((Date.now() - pollingStartTime) / 1000).toFixed(1);
        const timeoutMsg = timeoutCount > 0 ? `, ${timeoutCount} timeout` : '';
        console.log(`✅ Polling complete: ${successCount} success, ${failCount} failed${timeoutMsg} (${duration}s)`);
    } catch (error) {
        console.error('❌ Polling error:', error instanceof Error ? error.message : error);
    } finally {
        isPolling = false;
        pollingStartTime = null;
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

