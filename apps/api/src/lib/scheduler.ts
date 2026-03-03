// Polling scheduler for MikroTik devices and other services
import { routerService, settingsService, oltService, genieacsService, backupService } from '../services/index.js';
import { alertEscalationService } from '../services/alert-escalation.service.js';
import { db } from '../db/index.js';
import { routerNetwatch, routerMetrics, tenants } from '../db/schema/index.js';
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
    { maxDevices: 50, config: { intervalMs: 30 * 1000, batchSize: 20, strategy: 'Full Check' } },
    { maxDevices: 200, config: { intervalMs: 60 * 1000, batchSize: 15, strategy: 'Batching' } },
    { maxDevices: 500, config: { intervalMs: 120 * 1000, batchSize: 10, strategy: 'Priority + Batching' } },
    { maxDevices: Infinity, config: { intervalMs: 300 * 1000, batchSize: 5, strategy: 'Sampling' } },
];

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let escalationInterval: ReturnType<typeof setInterval> | null = null;
let oltSnmpInterval: ReturnType<typeof setInterval> | null = null;
let oltWebInterval: ReturnType<typeof setInterval> | null = null;
let acsInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let autoBackupInterval: ReturnType<typeof setInterval> | null = null;
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
/**
 * Poll all routers for a specific tenant
 */
async function pollTenantRouters(tenantId: string, scalingConfig: ScalingConfig): Promise<{ success: number; fail: number; timeout: number }> {
    const BATCH_SIZE = scalingConfig.batchSize;
    let successCount = 0;
    let failCount = 0;
    let timeoutCount = 0;

    try {
        const routers = await routerService.findAll(tenantId);
        if (routers.length === 0) return { success: 0, fail: 0, timeout: 0 };

        logger.debug(`🔄 [Tenant: ${tenantId}] Polling ${routers.length} routers...`);

        const processRouter = async (router: any) => {
            try {
                const metricsIntervalMs = (router.pollingIntervalMetrics || 300) * 1000;
                const now = Date.now();
                const lastFullSyncTime = router.lastFullSync ? new Date(router.lastFullSync).getTime() : 0;
                const timeSinceLastFullSync = now - lastFullSyncTime;

                // Full sync if it's been long enough or never happened
                const isFullSync = timeSinceLastFullSync >= metricsIntervalMs || lastFullSyncTime === 0;

                const needsDetection = await db.select({ count: count() })
                    .from(routerNetwatch)
                    .where(and(eq(routerNetwatch.routerId, router.id), eq(routerNetwatch.hasWebhook, false)))
                    .then(res => (res[0]?.count || 0) > 0);

                // Ensure Netwatch is always polled at the Tier Strategy interval
                // even if Webhook is enabled, to keep it "same as before" and redundant.
                const includeNetwatch = true;

                if (!includeNetwatch && !isFullSync) {
                    return { success: true, timeout: false, skipped: true };
                }

                await withTimeout(
                    routerService.refreshRouterStatus(router.id, includeNetwatch, isFullSync),
                    ROUTER_TIMEOUT,
                    `Timeout polling router ${router.name}`
                );
                return { success: true, timeout: false, skipped: false };
            } catch (error) {
                const isTimeout = error instanceof Error && error.message.includes('Timeout');
                return { success: false, timeout: isTimeout };
            }
        };

        for (let i = 0; i < routers.length; i += BATCH_SIZE) {
            const batch = routers.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(async (r, index) => {
                const jitter = (index * 150) + Math.floor(Math.random() * 2500);
                await new Promise(resolve => setTimeout(resolve, jitter));
                return processRouter(r);
            }));

            results.forEach(res => {
                if (res.success) successCount++;
                else if (res.timeout) timeoutCount++;
                else failCount++;
            });
        }
    } catch (error) {
        logger.error({ tenantId, err: error }, '❌ Tenant polling error');
    }

    return { success: successCount, fail: failCount, timeout: timeoutCount };
}

/**
 * Poll all routers across all tenants
 */
async function pollAllRouters(): Promise<void> {
    checkPollingStuck();
    if (isPolling) {
        logger.debug('⏳ Previous polling still in progress, skipping...');
        return;
    }

    isPolling = true;
    pollingStartTime = Date.now();

    try {
        const allTenants = await db.select().from(tenants);
        let totalSuccess = 0;
        let totalFail = 0;
        let totalTimeout = 0;

        // Update scaling config based on total size
        const netwatchCount = await getTotalNetwatchCount();
        lastNetwatchCount = netwatchCount;
        currentScalingConfig = getScalingConfig(netwatchCount);

        for (const tenant of allTenants) {
            const results = await pollTenantRouters(tenant.id, currentScalingConfig);
            totalSuccess += results.success;
            totalFail += results.fail;
            totalTimeout += results.timeout;
        }

        const duration = ((Date.now() - pollingStartTime) / 1000).toFixed(1);
        const timeoutMsg = totalTimeout > 0 ? `, ${totalTimeout} timeout` : '';
        logger.info(`✅ Polling complete: ${totalSuccess} success, ${totalFail} failed${timeoutMsg} (${duration}s)`);

        // Dynamic Interval Scaling: Restart interval if the duration changed
        const newIntervalMs = currentScalingConfig.intervalMs;
        const currentIntervalMs = (pollingInterval as any)?._idleTimeout || 0; // Simple check for current interval

        if (pollingInterval && newIntervalMs !== currentIntervalMs && currentIntervalMs > 0) {
            logger.info({
                oldInterval: currentIntervalMs / 1000,
                newInterval: newIntervalMs / 1000,
                strategy: currentScalingConfig.strategy
            }, '🔄 Polling interval adapted to scaling tier');

            clearInterval(pollingInterval);
            pollingInterval = setInterval(pollAllRouters, newIntervalMs);
        }
    } catch (error) {
        logger.error({ err: error }, '❌ Global polling error');
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
    try {
        const allTenants = await db.select().from(tenants);
        for (const tenant of allTenants) {
            const enabled = await settingsService.getSettingValue('olt_sync_enabled', tenant.id, true);
            if (!enabled) continue;

            const allOlts = await oltService.findAll(tenant.id);
            // Staggered execution per tenant
            for (let i = 0; i < allOlts.length; i++) {
                setTimeout(async () => {
                    try {
                        await oltService.refreshStatus(allOlts[i].id, tenant.id);
                    } catch (e) {
                        logger.error({ err: e, olt: allOlts[i].name }, 'Failed to poll OLT (SNMP)');
                    }
                }, i * 2000);
            }
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in OLT SNMP Polling');
    }
}

/**
 * Sync OLT ONU Details (Web - Slow/Hybrid)
 */
async function pollOltsWeb(): Promise<void> {
    try {
        const allTenants = await db.select().from(tenants);
        for (const tenant of allTenants) {
            const enabled = await settingsService.getSettingValue('olt_sync_enabled', tenant.id, true);
            if (!enabled) continue;

            const allOlts = await oltService.findAll(tenant.id);
            // Staggered execution per tenant
            for (let i = 0; i < allOlts.length; i++) {
                setTimeout(async () => {
                    try {
                        await oltService.refreshStatus(allOlts[i].id, tenant.id);
                        await oltService.syncOnuInventory(allOlts[i].id, tenant.id);
                    } catch (e) {
                        logger.error({ err: e, olt: allOlts[i].name }, 'Failed to sync OLT (Web)');
                    }
                }, i * 10000);
            }
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in OLT Web Polling');
    }
}

/**
 * Sync GenieACS Devices
 */
async function syncGenieAcs(): Promise<void> {
    try {
        const allTenants = await db.select().from(tenants);
        for (const tenant of allTenants) {
            const enabled = await settingsService.getSettingValue('acs_sync_enabled', tenant.id, true);
            if (!enabled) continue;

            const tenantId = tenant.id;
            logger.info({ tenantId }, '[Scheduler] Running GenieACS sync for tenant...');

            // 1. Sync metadata from global ACS if configured for this tenant
            await genieacsService.syncMetadata(undefined, tenantId);

            // 2. Sync specific routers that have dedicated GenieACS settings
            const routers = await routerService.findAll(tenantId);
            const routersWithDedicatedAcs = routers.filter(r => r.useGenieAcs && r.genieacsUrl);

            if (routersWithDedicatedAcs.length > 0) {
                for (const router of routersWithDedicatedAcs) {
                    try {
                        await genieacsService.syncMetadata(router.id, tenantId);
                    } catch (e) {
                        logger.error({ err: e, router: router.name }, 'Failed to sync GenieACS for router');
                    }
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
        const allTenants = await db.select().from(tenants);
        for (const tenant of allTenants) {
            const retentionDays = await settingsService.getSettingValue('metrics_retention_days', tenant.id, 30);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);

            const result = await db.delete(routerMetrics)
                .where(and(eq(routerMetrics.tenantId, tenant.id), lt(routerMetrics.recordedAt, cutoff)))
                .returning();

            if (result.length > 0) {
                logger.info({ tenantId: tenant.id, deleted: result.length }, '✅ Tenant metrics cleanup complete');
            }
        }
    } catch (error) {
        logger.error({ err: error }, 'Metrics cleanup error');
    }
}

/**
 * Start the background polling scheduler
 */
export async function startScheduler(): Promise<void> {
    logger.info('⏰ Starting multi-tenant background scheduler...');

    // Initial Runs (Staggered)
    setTimeout(() => pollAllRouters(), 5000);
    setTimeout(() => checkAlertEscalation(), 10000);
    setTimeout(() => pollOltsSnmp(), 15000);
    setTimeout(() => pollOltsWeb(), 60000);
    setTimeout(() => syncGenieAcs(), 30000);
    setTimeout(() => cleanupOldMetrics(), 120000);
    setTimeout(() => backupService.automatedBackup(), 180000);

    // Heartbeat Intervals (Simplified to check all tenants each pulse)
    // We use a frequent heartbeat and internal checks if needed, 
    // but here we keep the existing interval structure for simplicity, 
    // now iterating over tenants inside each function.

    // Dynamic interval based on device count
    const intervalMs = currentScalingConfig?.intervalMs || 2 * 60 * 1000;
    pollingInterval = setInterval(pollAllRouters, intervalMs);

    escalationInterval = setInterval(checkAlertEscalation, ESCALATION_CHECK_INTERVAL);
    oltSnmpInterval = setInterval(pollOltsSnmp, 5 * 60000); // 5 min default
    oltWebInterval = setInterval(pollOltsWeb, 15 * 60000); // 15 min default
    acsInterval = setInterval(syncGenieAcs, 10 * 60 * 1000); // 10 min default
    cleanupInterval = setInterval(cleanupOldMetrics, 24 * 60 * 60 * 1000); // Daily
    autoBackupInterval = setInterval(() => backupService.automatedBackup(), 24 * 60 * 60 * 1000); // Daily
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
    if (autoBackupInterval) { clearInterval(autoBackupInterval); autoBackupInterval = null; }

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
