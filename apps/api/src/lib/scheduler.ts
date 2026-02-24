import { routerService, settingsService, oltService, genieacsService } from '../services/index.js';
import { alertEscalationService } from '../services/alert-escalation.service.js';
import { db } from '../db/index.js';
import { routerNetwatch, routerMetrics } from '../db/schema/index.js';
import { count, eq, lt, and } from 'drizzle-orm';
import { logger } from './logger.js';

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
    { maxDevices: 50, config: { intervalMs: 30 * 1000, batchSize: 20, strategy: 'Full check' } },
    { maxDevices: 200, config: { intervalMs: 60 * 1000, batchSize: 15, strategy: 'Batching' } },
    { maxDevices: 500, config: { intervalMs: 120 * 1000, batchSize: 10, strategy: 'Priority + Batching' } },
    { maxDevices: Infinity, config: { intervalMs: 300 * 1000, batchSize: 5, strategy: 'Sampling + Alert only' } },
];

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let escalationInterval: ReturnType<typeof setInterval> | null = null;
let oltSnmpInterval: ReturnType<typeof setInterval> | null = null;
let oltWebInterval: ReturnType<typeof setInterval> | null = null;
let acsInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
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

        logger.info(`📊 Adaptive scaling: ${netwatchCount} devices → ${currentScalingConfig.intervalMs / 1000}s interval, batch=${currentScalingConfig.batchSize} (${currentScalingConfig.strategy})`);

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
    let timeoutId: NodeJS.Timeout;
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
            logger.warn({ elapsedSeconds: Math.round(elapsed / 1000) }, '⚠️ Polling stuck, force resetting...');
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
        logger.debug('⏳ Previous polling still in progress, skipping...');
        return;
    }

    isPolling = true;
    pollingStartTime = Date.now();
    const date = new Date(pollingStartTime);

    // Use adaptive batch size from scaling config
    const BATCH_SIZE = currentScalingConfig.batchSize;

    try {
        const routers = await routerService.findAll();

        logger.debug(`🔄 Polling ${routers.length} routers (${lastNetwatchCount} netwatch, batch=${BATCH_SIZE})...`);

        let successCount = 0;
        let failCount = 0;
        let timeoutCount = 0;

        // Helper function to process a single router with timeout
        const processRouter = async (router: any) => {
            try {
                // Read router's polling interval for metrics (default 300s = 5 minutes)
                const metricsIntervalMs = (router.pollingIntervalMetrics || 300) * 1000;

                const now = Date.now();
                const lastUpdatedTime = router.updatedAt ? new Date(router.updatedAt).getTime() : 0;
                const timeSinceLastUpdate = now - lastUpdatedTime;

                // Trigger full sync (slow poll) if it's been longer than the configured interval
                const isFullSync = timeSinceLastUpdate >= metricsIntervalMs || lastUpdatedTime === 0;

                // For fast polling, if Webhook is enabled, we skip Netwatch API sync to save resources.
                // UNLESS we haven't detected the webhook yet (hasWebhook is false in at least one entry).
                // It will only run Netwatch API sync during the Full Sync as a fallback if detected.

                // We'll check if any netwatch entry for this router is missing the hasWebhook flag
                const needsDetection = await db.select({ count: count() })
                    .from(routerNetwatch)
                    .where(and(eq(routerNetwatch.routerId, router.id), eq(routerNetwatch.hasWebhook, false)))
                    .then(res => (res[0]?.count || 0) > 0);

                const includeNetwatch = !(router.useWebhook && !isFullSync && !needsDetection);

                if (!includeNetwatch && !isFullSync) {
                    // Skip polling completely for this tick: Webhook handles status, and metrics isn't due yet
                    return { success: true, timeout: false, skipped: true };
                }

                // Wrap refreshRouterStatus with timeout
                await withTimeout(
                    routerService.refreshRouterStatus(router.id, includeNetwatch, isFullSync),
                    ROUTER_TIMEOUT,
                    `Timeout polling router ${router.name}`
                );
                return { success: true, timeout: false, skipped: false };
            } catch (error) {
                const isTimeout = error instanceof Error && error.message.includes('Timeout');
                if (isTimeout) {
                    logger.error({ router: router.name }, `⏰ Timeout polling router (>${ROUTER_TIMEOUT / 1000}s)`);
                } else {
                    logger.error({ router: router.name, err: error }, '❌ Failed to poll router');
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
        logger.info(`✅ Polling complete: ${successCount} success, ${failCount} failed${timeoutMsg} (${duration}s)`);
    } catch (error) {
        logger.error({ err: error }, '❌ Polling error');
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
        logger.error({ err: error }, '❌ Escalation check error');
    }
}

/**
 * Poll OLT Status (SNMP - Fast)
 */
async function pollOltsSnmp(): Promise<void> {
    const enabled = await settingsService.getSettingValue('olt_sync_enabled', true);
    if (!enabled) return;

    try {
        const allOlts = await oltService.findAll();
        // Staggered execution: Process 1 OLT every 2 seconds
        for (let i = 0; i < allOlts.length; i++) {
            setTimeout(async () => {
                try {
                    await oltService.refreshStatus(allOlts[i].id);
                } catch (e) {
                    logger.error({ err: e, olt: allOlts[i].name }, 'Failed to poll OLT (SNMP)');
                }
            }, i * 2000);
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in OLT SNMP Polling');
    }
}

/**
 * Sync OLT ONU Details (Web - Slow/Hybrid)
 */
async function pollOltsWeb(): Promise<void> {
    const enabled = await settingsService.getSettingValue('olt_sync_enabled', true);
    if (!enabled) return;

    try {
        const allOlts = await oltService.findAll();
        // Staggered execution: Process 1 OLT every 10 seconds to save CPU
        for (let i = 0; i < allOlts.length; i++) {
            setTimeout(async () => {
                try {
                    await oltService.refreshStatus(allOlts[i].id);
                } catch (e) {
                    logger.error({ err: e, olt: allOlts[i].name }, 'Failed to sync OLT (Web)');
                }
            }, i * 10000);
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in OLT Web Polling');
    }
}

/**
 * Sync GenieACS Devices
 */
async function syncGenieAcs(): Promise<void> {
    const enabled = await settingsService.getSettingValue('acs_sync_enabled', true);
    if (!enabled) return;

    try {
        // 1. Always attempt global sync (fallback)
        logger.info('[Scheduler] Running global GenieACS sync...');
        await genieacsService.syncMetadata();

        // 2. Also sync specific routers that have dedicated GenieACS settings
        const allRouters = await routerService.findAll();
        const routersWithDedicatedAcs = allRouters.filter(r => r.useGenieAcs && r.genieacsUrl);

        if (routersWithDedicatedAcs.length > 0) {
            logger.info({ count: routersWithDedicatedAcs.length }, '[Scheduler] Running dedicated GenieACS sync');
            for (const router of routersWithDedicatedAcs) {
                try {
                    logger.debug({ router: router.name }, '[Scheduler] Syncing GenieACS for router');
                    await genieacsService.syncMetadata(router.id);
                } catch (e) {
                    logger.error({ err: e, router: router.name }, 'Failed to sync GenieACS for router');
                }
            }
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in GenieACS Sync');
    }
}

/**
 * Cleanup old metrics data based on retention policy
 */
async function cleanupOldMetrics(): Promise<void> {
    try {
        const retentionDays = await settingsService.getSettingValue('metrics_retention_days', 30);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);

        logger.info(`🧹 Starting metrics cleanup (Retention: ${retentionDays} days, Cutoff: ${cutoff.toISOString()})`);

        const result = await db.delete(routerMetrics)
            .where(lt(routerMetrics.recordedAt, cutoff))
            .returning();

        logger.info(`✅ Cleanup complete: Deleted ${result.length} old metrics records`);
    } catch (error) {
        logger.error({ err: error }, 'Metrics cleanup error');
    }
}

/**
 * Start the background polling scheduler
 */
export async function startScheduler(): Promise<void> {
    // 1. Router Polling
    const interval = await getPollingInterval();
    const minutes = Math.round(interval / 60000);
    logger.info(`⏰ Starting router polling scheduler (every ${minutes} minute${minutes > 1 ? 's' : ''})`);

    // 2. Alert Escalation
    logger.info('⏰ Starting alert escalation checker (every 5 minutes)');

    // 3. OLT SNMP (Fast)
    const snmpMinutes = await settingsService.getSettingValue('olt_polling_interval', 1);
    logger.info(`⏰ Starting OLT SNMP polling (every ${snmpMinutes} minute${snmpMinutes > 1 ? 's' : ''})`);

    // 4. OLT Web (Slow)
    const webMinutes = await settingsService.getSettingValue('olt_web_interval', 10);
    logger.info(`⏰ Starting OLT Web Sync (every ${webMinutes} minute${webMinutes > 1 ? 's' : ''})`);

    // 5. GenieACS
    const acsMinutes = await settingsService.getSettingValue('acs_polling_interval', 10);
    logger.info(`⏰ Starting GenieACS Sync (every ${acsMinutes} minute${acsMinutes > 1 ? 's' : ''})`);

    // 6. Metrics Cleanup
    logger.info('⏰ Starting daily metrics cleanup job (every 24 hours)');

    // Initial Runs (Staggered)
    setTimeout(() => pollAllRouters(), 5000);
    setTimeout(() => checkAlertEscalation(), 10000);

    // OLT/ACS Initial Run
    setTimeout(() => pollOltsSnmp(), 15000);
    setTimeout(() => pollOltsWeb(), 60000); // Wait 1 min for Web sync
    setTimeout(() => syncGenieAcs(), 30000);

    // Initial cleanup run after 2 minutes
    setTimeout(() => cleanupOldMetrics(), 120000);

    // Intervals
    pollingInterval = setInterval(pollAllRouters, interval);
    escalationInterval = setInterval(checkAlertEscalation, ESCALATION_CHECK_INTERVAL);

    if (snmpMinutes > 0) oltSnmpInterval = setInterval(pollOltsSnmp, snmpMinutes * 60000);
    if (webMinutes > 0) oltWebInterval = setInterval(pollOltsWeb, webMinutes * 60000);
    if (acsMinutes > 0) acsInterval = setInterval(syncGenieAcs, acsMinutes * 60000);

    // Daily cleanup interval (24 hours)
    cleanupInterval = setInterval(cleanupOldMetrics, 24 * 60 * 60 * 1000);
}

/**
 * Stop the background polling scheduler
 */
export function stopScheduler(): void {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    if (escalationInterval) { clearInterval(escalationInterval); escalationInterval = null; }
    if (oltSnmpInterval) { clearInterval(oltSnmpInterval); oltSnmpInterval = null; }
    if (oltWebInterval) { clearInterval(oltWebInterval); oltWebInterval = null; }
    if (acsInterval) { clearInterval(acsInterval); acsInterval = null; }
    if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }

    logger.info('🛑 Scheduler stopped');
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
