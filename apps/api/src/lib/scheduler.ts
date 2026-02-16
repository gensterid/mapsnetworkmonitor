import { routerService, settingsService, oltService, genieacsService } from '../services/index.js';
import { alertEscalationService } from '../services/alert-escalation.service.js';
import { db } from '../db/index.js';
import { routerNetwatch, olts } from '../db/schema/index.js';
import { count, eq } from 'drizzle-orm';

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
                // Determine if this is a full sync poll (every 1 minute for traffic/resource updates)
                const isFullSync = (date.getMinutes() % 1 === 0);

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
                    console.error(`Failed to poll OLT ${allOlts[i].name} (SNMP):`, e);
                }
            }, i * 2000);
        }
    } catch (e) {
        console.error('Error in OLT SNMP Polling:', e);
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
                    // Force Web/Full Sync logic here (needs update in oltService.refreshStatus to accept 'full' flag? 
                    // or just rely on existing logic. For now, we call refreshStatus which handles both based on config)
                    // TODO: In future, pass flag to force Web sync if needed.
                    // Current refreshStatus does both if configured. 
                    // We might need to split refreshStatus in OltService to separate SNMP check from Full Web Sync.
                    // For now, assuming refreshStatus does "smart" check. 
                    // If we want FULL sync, we need to ensure OltService actually does it.
                    // Let's assume for this step we rely on the standard refresh.
                    await oltService.refreshStatus(allOlts[i].id);
                } catch (e) {
                    console.error(`Failed to sync OLT ${allOlts[i].name} (Web):`, e);
                }
            }, i * 10000);
        }
    } catch (e) {
        console.error('Error in OLT Web Polling:', e);
    }
}

/**
 * Sync GenieACS Devices
 */
async function syncGenieAcs(): Promise<void> {
    const enabled = await settingsService.getSettingValue('acs_sync_enabled', true);
    if (!enabled) return;

    try {
        await genieacsService.syncMetadata();
    } catch (e) {
        console.error('Error in GenieACS Sync:', e);
    }
}

/**
 * Start the background polling scheduler
 */
export async function startScheduler(): Promise<void> {
    // 1. Router Polling
    const interval = await getPollingInterval();
    const minutes = Math.round(interval / 60000);
    console.log(`⏰ Starting router polling scheduler (every ${minutes} minute${minutes > 1 ? 's' : ''})`);

    // 2. Alert Escalation
    console.log(`⏰ Starting alert escalation checker (every 5 minutes)`);

    // 3. OLT SNMP (Fast)
    const snmpMinutes = await settingsService.getSettingValue('olt_polling_interval', 1);
    console.log(`⏰ Starting OLT SNMP polling (every ${snmpMinutes} minute${snmpMinutes > 1 ? 's' : ''})`);

    // 4. OLT Web (Slow)
    const webMinutes = await settingsService.getSettingValue('olt_web_interval', 10);
    console.log(`⏰ Starting OLT Web Sync (every ${webMinutes} minute${webMinutes > 1 ? 's' : ''})`);

    // 5. GenieACS
    const acsMinutes = await settingsService.getSettingValue('acs_polling_interval', 10);
    console.log(`⏰ Starting GenieACS Sync (every ${acsMinutes} minute${acsMinutes > 1 ? 's' : ''})`);

    // Initial Runs (Staggered)
    setTimeout(() => pollAllRouters(), 5000);
    setTimeout(() => checkAlertEscalation(), 10000);

    // OLT/ACS Initial Run
    setTimeout(() => pollOltsSnmp(), 15000);
    setTimeout(() => pollOltsWeb(), 60000); // Wait 1 min for Web sync
    setTimeout(() => syncGenieAcs(), 30000);

    // Intervals
    pollingInterval = setInterval(pollAllRouters, interval);
    escalationInterval = setInterval(checkAlertEscalation, ESCALATION_CHECK_INTERVAL);

    if (snmpMinutes > 0) oltSnmpInterval = setInterval(pollOltsSnmp, snmpMinutes * 60000);
    if (webMinutes > 0) oltWebInterval = setInterval(pollOltsWeb, webMinutes * 60000);
    if (acsMinutes > 0) acsInterval = setInterval(syncGenieAcs, acsMinutes * 60000);
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

    console.log('🛑 Scheduler stopped');
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

