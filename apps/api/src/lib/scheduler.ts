// Polling scheduler for MikroTik devices and other services
import { routerService, settingsService, oltService, genieacsService, backupService, routerSyncQueue, oltSyncQueue, startQueueWorker, stopQueueWorker, metricsService, routerMetricsService } from '../services/index.js';
import { alertEscalationService } from '../services/alert-escalation.service.js';
import { db } from '../db/index.js';
import { routers, routerNetwatch, olts, onus, tenants, routerMetrics, routerInterfaceMetrics, alerts, auditLogs, devicePerformanceHistory } from '../db/schema/index.js';
import { count, eq, lt, and, sql } from 'drizzle-orm';
import { logger } from './logger.js';
import { partitionService } from '../services/db/partition.service.js';

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
let acsWarmerInterval: ReturnType<typeof setInterval> | null = null;
let metricsInterval: ReturnType<typeof setInterval> | null = null;
let routerSnmpInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let autoBackupInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let isPollingSnmp = false;
let pollingStartTime: number | null = null;
let snmpPollingStartTime: number | null = null;
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

        // Filter out routers in maintenance mode to prevent conflicts
        const activeRouters = routers.filter(r => r.status !== 'maintenance');

        if (activeRouters.length === 0) return { success: 0, fail: 0, timeout: 0 };

        logger.debug(`🔄 [Tenant: ${tenantId}] Polling ${activeRouters.length} active routers (Skipped ${routers.length - activeRouters.length} in maintenance)...`);

        // Add all active routers to the background queue
        const jobs = activeRouters.map(router => ({
            name: `sync-${router.id}`,
            data: {
                routerId: router.id,
                includeNetwatch: true,
                isFullSync: (Date.now() - (router.lastFullSync ? new Date(router.lastFullSync).getTime() : 0)) >= (router.pollingIntervalMetrics || 300) * 1000,
                tenantId
            },
            opts: {
                jobId: `sync-${router.id}-${Math.floor(Date.now() / 60000)}`, // Max one sync per minute per router
            }
        }));

        try {
            await routerSyncQueue.addBulk(jobs);
            successCount = routers.length;
            logger.info(`📨 [Tenant: ${tenantId}] Added ${routers.length} routers to background sync queue`);
        } catch (queueError: any) {
            logger.warn({ tenantId, err: queueError.message }, '⚠️ Redis Queue failed, falling back to direct polling (Sequentially)...');
            
            // Fallback: limited concurrency polling when Redis is down
            // This prevents overwhelming the DB while still being faster than pure sequential.
            const CONCURRENCY_LIMIT = 5;
            const chunks = [];
            for (let i = 0; i < activeRouters.length; i += CONCURRENCY_LIMIT) {
                chunks.push(activeRouters.slice(i, i + CONCURRENCY_LIMIT));
            }

            for (const chunk of chunks) {
                await Promise.all(
                    chunk.map(async (router) => {
                        try {
                            const isFullSync = (Date.now() - (router.lastFullSync ? new Date(router.lastFullSync).getTime() : 0)) >= (router.pollingIntervalMetrics || 300) * 1000;
                            // Add a per-router timeout to prevent connection pool exhaustion
                            await withTimeout(
                                routerService.refreshRouterStatus(router.id, true, isFullSync, tenantId),
                                30000, 
                                `Polling timeout for ${router.name}`
                            );
                            successCount++;
                        } catch (syncErr: any) {
                            logger.error({ routerId: router.id, err: syncErr.message }, `❌ Polling failed: ${syncErr.message}`);
                            failCount++;
                        }
                    })
                );
            }
        }
    } catch (error: any) {
        logger.error({ tenantId, err: error.message }, '❌ Tenant polling error');
    }

    return { success: successCount, fail: failCount, timeout: timeoutCount };
}

/**
 * Poll all routers across all tenants
 */
async function pollAllRouters(): Promise<void> {
    checkPollingStuck();

    if (process.env.SYNC_ENABLED === 'false') {
        logger.debug('⏭️ Background sync is disabled via SYNC_ENABLED=false');
        return;
    }

    if (isPolling) {
        logger.debug('⏳ Previous polling still in progress, skipping...');
        return;
    }

    isPolling = true;
    pollingStartTime = Date.now();
    logger.info('💓 [Heartbeat] Starting global polling cycle...');

    try {
        const allTenants = await db.select().from(tenants);
        let totalSuccess = 0;
        let totalFail = 0;
        let totalTimeout = 0;

        // Update scaling config based on total size
        const netwatchCount = await getTotalNetwatchCount();
        lastNetwatchCount = netwatchCount;
        currentScalingConfig = getScalingConfig(netwatchCount);

        const TENANT_CONCURRENCY = 3;
        for (let i = 0; i < allTenants.length; i += TENANT_CONCURRENCY) {
            const batch = allTenants.slice(i, i + TENANT_CONCURRENCY);
            await Promise.all(batch.map(async (tenant) => {
                const results = await pollTenantRouters(tenant.id, currentScalingConfig);
                totalSuccess += results.success;
                totalFail += results.fail;
                totalTimeout += results.timeout;
            }));
        }

        const duration = ((Date.now() - pollingStartTime!) / 1000).toFixed(1);
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
            for (const olt of allOlts) {
                await oltSyncQueue.add('olt-refresh', {
                    oltId: olt.id,
                    tenantId: tenant.id,
                    type: 'refresh'
                }, {
                    jobId: `olt-refresh-${olt.id}-${Date.now()}`,
                    removeOnComplete: true
                });
            }
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in OLT SNMP Polling Dispatch');
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
            for (const olt of allOlts) {
                await oltSyncQueue.add('olt-inventory', {
                    oltId: olt.id,
                    tenantId: tenant.id,
                    type: 'sync-inventory'
                }, {
                    jobId: `olt-inventory-${olt.id}-${Date.now()}`,
                    removeOnComplete: true
                });
            }
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in OLT Web Polling Dispatch');
    }
}

/**
 * Update Prometheus Metrics Gauges
 */
async function updatePrometheusMetrics(): Promise<void> {
    try {
        await metricsService.updateSystemGauges();
        await metricsService.updateQueueGauges();
        logger.debug('📊 Prometheus gauges updated');
    } catch (e) {
        logger.error({ err: e }, 'Failed to update Prometheus metrics');
    }
}

/**
 * Poll all routers for real-time traffic using SNMP (60s frequency)
 */
async function pollRoutersSnmp(): Promise<void> {
    if (process.env.SYNC_ENABLED === 'false') return;

    if (isPollingSnmp) {
        const elapsed = (Date.now() - (snmpPollingStartTime || 0)) / 1000;
        if (elapsed > 300) { // 5 min safety timeout
            logger.warn({ elapsed }, '⚠️ SNMP polling stuck, force resetting...');
            isPollingSnmp = false;
        } else {
            logger.debug('⏳ Previous SNMP polling still in progress, skipping...');
            return;
        }
    }

    isPollingSnmp = true;
    snmpPollingStartTime = Date.now();
    logger.info('💓 [Heartbeat] Starting high-frequency SNMP polling cycle...');

    try {
        const allTenants = await db.select().from(tenants);
        for (const tenant of allTenants) {
            const enabled = await settingsService.getSettingValue('router_snmp_poll_enabled', tenant.id, true);
            if (!enabled) continue;

            // Find all online routers with SNMP host configured
            const routersList = await routerService.findAll(tenant.id);
            const onlineRouters = routersList.filter(r => r.status === 'online' && r.host && r.useSnmp !== false);

            if (onlineRouters.length === 0) continue;

            logger.debug({ count: onlineRouters.length, tenantId: tenant.id }, '📡 Running high-frequency SNMP traffic poll for routers');

            // Process in parallel with concurrency limit (e.g. 10 at a time)
            const BATCH_SIZE = 10;
            for (let i = 0; i < onlineRouters.length; i += BATCH_SIZE) {
                const batch = onlineRouters.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (router) => {
                    try {
                        // Directly call metrics service to fetch and update DB traffic counters
                        await routerMetricsService.getSnmpTraffic(router);
                    } catch (snmpErr: any) {
                        logger.warn({ router: router.name, err: snmpErr.message }, 'SNMP background poll failed for individual router');
                    }
                }));
            }
        }
    } catch (e: any) {
        logger.error({ err: e.message }, 'Error in global Router SNMP polling task');
    } finally {
        isPollingSnmp = false;
        snmpPollingStartTime = null;
    }
}

const lastGlobalAcsSync = new Map<string, number>();
const lastDedicatedAcsSync = new Map<string, number>();

/**
 * Sync GenieACS Devices
 */
async function syncGenieAcs(): Promise<void> {
    try {
        const allTenants = await db.select().from(tenants);
        const now = Date.now();

        for (const tenant of allTenants) {
            const tenantId = tenant.id;
            const masterEnabled = await settingsService.getSettingValue('genieacs_enabled', tenantId, true);
            if (!masterEnabled) continue;

            const syncEnabled = await settingsService.getSettingValue('acs_sync_enabled', tenantId, true);
            const pollingIntervalMin = await settingsService.getSettingValue('acs_polling_interval', tenantId, 10);
            const pollingIntervalMs = pollingIntervalMin * 60 * 1000;

            // 1. Sync metadata from global ACS
            if (syncEnabled) {
                const lastSync = lastGlobalAcsSync.get(tenantId) || 0;
                if (now - lastSync >= pollingIntervalMs) {
                    logger.info({ tenantId }, '[Scheduler] Running Global GenieACS sync for tenant...');
                    // Optimized: Directly call syncMetadata which now handles connectivity internally or fails gracefully
                    await genieacsService.syncMetadata(undefined, tenantId).catch(e => {
                        logger.warn({ err: e.message, tenantId }, 'Global GenieACS sync failed');
                    });
                    lastGlobalAcsSync.set(tenantId, now);
                }
            }

            // 2. Sync specific routers that have dedicated GenieACS settings
            // Dedicated sync runs on the same frequency as global for now, but is independently enabled.
            const routers = await routerService.findAll(tenantId);
            const routersWithDedicatedAcs = routers.filter(r => r.useGenieAcs && r.genieacsUrl);

            if (routersWithDedicatedAcs.length > 0) {
                for (const router of routersWithDedicatedAcs) {
                    const lastSync = lastDedicatedAcsSync.get(router.id) || 0;
                    // We use the same pollingIntervalMs for dedicated routers as well, 
                    // providing a single logical "ACS Polling Frequency" setting.
                    if (now - lastSync >= pollingIntervalMs) {
                        try {
                            await genieacsService.syncMetadata(router.id, tenantId);
                            lastDedicatedAcsSync.set(router.id, now);
                        } catch (e) {
                            logger.error({ err: e, router: router.name }, 'Failed to sync GenieACS for router');
                        }
                    }
                }
            }
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in GenieACS Sync');
    }
}

/**
 * Performs deletion in batches to avoid table locking and long transactions.
 */
async function batchDelete(tableName: string, whereClause: string, params: any[], batchSize: number = 5000): Promise<number> {
    let totalDeleted = 0;
    let deletedInBatch = batchSize;

    logger.debug({ tableName, whereClause }, '🧹 Starting batch cleanup...');

    while (deletedInBatch === batchSize) {
        // We use a raw query because Drizzle doesn't natively support DELETE with LIMIT in all dialects
        // and fetching IDs first for millions of rows would be memory-intensive.
        const query = sql.raw(`
            DELETE FROM ${tableName} 
            WHERE id IN (
                SELECT id FROM ${tableName} 
                WHERE ${whereClause} 
                LIMIT ${batchSize}
            )
        `);

        try {
            const result = await db.execute(query);
            // Postgres rows affected is usually in the second element of the result for raw execute
            // or directly on the result depending on the driver version.
            // Using a safe estimation here.
            deletedInBatch = (result as any).rowCount || 0;
            totalDeleted += deletedInBatch;
            
            if (deletedInBatch > 0) {
                logger.debug({ tableName, deletedInBatch, totalDeleted }, '🧹 Batch deleted');
                // Brief pause to let other operations happen
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        } catch (err: any) {
            logger.error({ err: err.message, tableName }, '❌ Batch delete failed');
            break;
        }
    }

    return totalDeleted;
}

/**
 * Cleanup old metrics data based on retention policy
 */
async function cleanupOldMetrics(): Promise<void> {
    try {
        const allTenants = await db.select().from(tenants);
        for (const tenant of allTenants) {
            // 1. Device metrics (CPU, RAM, etc.) - HIGH VOLUME
            const metricsRetention = await settingsService.getSettingValue('metrics_retention_days', tenant.id, 30);
            const mCutoff = new Date();
            mCutoff.setDate(mCutoff.getDate() - metricsRetention);
            const mCutoffStr = mCutoff.toISOString();

            await batchDelete('router_metrics', `tenant_id = '${tenant.id}' AND recorded_at < '${mCutoffStr}'`, []);

            // 1b. Device Latency & Signal history (Performance) - HIGH VOLUME
            const perfRetention = await settingsService.getSettingValue('performance_retention_days', tenant.id, 30);
            const pCutoff = new Date();
            pCutoff.setDate(pCutoff.getDate() - perfRetention);
            const pCutoffStr = pCutoff.toISOString();

            await batchDelete('device_performance_history', `tenant_id = '${tenant.id}' AND recorded_at < '${pCutoffStr}'`, []);

            // 2. Interface traffic metrics - HIGH VOLUME
            const ifMetricsRetention = await settingsService.getSettingValue('interface_metrics_retention_days', tenant.id, 30);
            const ifCutoff = new Date();
            ifCutoff.setDate(ifCutoff.getDate() - ifMetricsRetention);
            const ifCutoffStr = ifCutoff.toISOString();

            await batchDelete('router_interface_metrics', `tenant_id = '${tenant.id}' AND recorded_at < '${ifCutoffStr}'`, []);

            // 3. Resolved Alerts (Low volume, usually safe for direct delete)
            const alertsRetention = await settingsService.getSettingValue('alerts_retention_days', tenant.id, 60);
            const aCutoff = new Date();
            aCutoff.setDate(aCutoff.getDate() - alertsRetention);

            await db.delete(alerts)
                .where(and(
                    eq(alerts.tenantId, tenant.id), 
                    eq(alerts.resolved, true), 
                    lt(alerts.createdAt, aCutoff)
                ));

            // 4. Audit Logs
            const auditRetention = await settingsService.getSettingValue('audit_logs_retention_days', tenant.id, 365);
            const auCutoff = new Date();
            auCutoff.setDate(auCutoff.getDate() - auditRetention);

            await db.delete(auditLogs)
                .where(and(eq(auditLogs.tenantId, tenant.id), lt(auditLogs.createdAt, auCutoff)));

            // 5. Backup Records
            const backupRetention = await settingsService.getSettingValue('backups_retention_days', tenant.id, 90);
            const bCutoff = new Date();
            bCutoff.setDate(bCutoff.getDate() - backupRetention);

            await db.execute(sql`DELETE FROM router_backups WHERE tenant_id = ${tenant.id} AND created_at < ${bCutoff}`);
            await db.execute(sql`DELETE FROM genieacs_backups WHERE tenant_id = ${tenant.id} AND created_at < ${bCutoff}`);

            // 6. Disconnected PPPoE Sessions
            const pppoeRetention = await settingsService.getSettingValue('pppoe_retention_days', tenant.id, 30);
            const pppCutoff = new Date();
            pppCutoff.setDate(pppCutoff.getDate() - pppoeRetention);
            
            await db.execute(sql`DELETE FROM pppoe_sessions WHERE tenant_id = ${tenant.id} AND status = 'disconnected' AND last_seen < ${pppCutoff}`);

            // Cleanup finished for tenant
            logger.info({ tenantId: tenant.id }, '✅ Tenant database maintenance complete');
        }

        // 7. Ensure future partitions exist
        await partitionService.ensurePartitionsExist();
    } catch (error) {
        logger.error({ err: error }, 'Database maintenance cleanup error');
    }
}

/**
 * Warm up GenieACS dashboard cache
 */
async function warmAcsDashboard(): Promise<void> {
    try {
        const allTenants = await db.select().from(tenants);
        for (const tenant of allTenants) {
            const masterEnabled = await settingsService.getSettingValue('genieacs_enabled', tenant.id, true);
            if (!masterEnabled) continue;

            const syncEnabled = await settingsService.getSettingValue('acs_sync_enabled', tenant.id, true);
            const tenantId = tenant.id;

            // Warm global ACS stats ONLY if sync toggle is ON
            if (syncEnabled) {
                // Warm global ACS stats if sync toggle is ON. 
                // getDashboardStats handles the config check internally.
                await genieacsService.getDashboardStats(undefined, tenantId, true).catch(() => { });
            }

            // Warm dedicated ACS
            const routers = await routerService.findAll(tenantId);
            const routersWithDedicatedAcs = routers.filter(r => r.useGenieAcs && r.genieacsUrl);

            if (routersWithDedicatedAcs.length > 0) {
                for (const router of routersWithDedicatedAcs) {
                    await genieacsService.getDashboardStats(router.id, tenantId, true).catch(() => { });
                }
            }
        }
    } catch (e) {
        logger.error({ err: e }, 'Error in GenieACS Background Warmer');
    }
}

/**
 * Start the background polling scheduler
 */
export async function startScheduler(): Promise<void> {
    logger.info('⏰ Starting multi-tenant background scheduler...');

    // Start BullMQ Worker
    startQueueWorker();

    // Initial Runs (Spread out to avoid peak load)
    setTimeout(() => pollAllRouters(), 10000);
    setTimeout(() => pollRoutersSnmp(), 5000); // Start SNMP sooner for immediate heartbeat
    setTimeout(() => checkAlertEscalation(), 25000);
    setTimeout(() => pollOltsSnmp(), 40000);
    setTimeout(() => warmAcsDashboard(), 55000);
    setTimeout(() => syncGenieAcs(), 75000);
    setTimeout(() => pollOltsWeb(), 120000); // Wait 2 mins for web sync
    setTimeout(() => cleanupOldMetrics(), 180000);
    setTimeout(() => backupService.automatedBackup(), 240000);

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

    // GenieACS sync (every 10 minutes)
    acsInterval = setInterval(syncGenieAcs, 10 * 60 * 1000);

    // Prometheus Metrics (every 1 minute)
    metricsInterval = setInterval(updatePrometheusMetrics, 60 * 1000);

    // Router SNMP Traffic (every 60 seconds)
    routerSnmpInterval = setInterval(pollRoutersSnmp, 60 * 1000);

    // Run immediately on start
    updatePrometheusMetrics();
    acsWarmerInterval = setInterval(warmAcsDashboard, 60000); // Warm dashboard every minute
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
    if (acsWarmerInterval) { clearInterval(acsWarmerInterval); acsWarmerInterval = null; }
    if (metricsInterval) { clearInterval(metricsInterval); metricsInterval = null; }
    if (routerSnmpInterval) { clearInterval(routerSnmpInterval); routerSnmpInterval = null; }
    if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
    if (autoBackupInterval) { clearInterval(autoBackupInterval); autoBackupInterval = null; }
    
    stopQueueWorker();
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
