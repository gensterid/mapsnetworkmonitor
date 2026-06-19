// Polling scheduler for MikroTik devices and other services
import { routerService, settingsService, oltService, genieacsService, backupService, routerSyncQueue, oltSyncQueue, startQueueWorker, stopQueueWorker, metricsService, routerMetricsService } from '../services/index.js';
import { shouldEnqueueRouter, queueHasCapacity } from '../services/queue.service.js';
import { alertEscalationService } from '../services/alert-escalation.service.js';
import { db } from '../db/index.js';
import { routers, routerNetwatch, olts, onus, tenants, routerMetrics, routerInterfaceMetrics, alerts, auditLogs, devicePerformanceHistory } from '../db/schema/index.js';
import { count, eq, lt, and, sql, isNull } from 'drizzle-orm';
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
let billingDailyInterval: ReturnType<typeof setInterval> | null = null;
let driftScanInterval: ReturnType<typeof setInterval> | null = null;
let netwatchAutoHealInterval: ReturnType<typeof setInterval> | null = null;
let netwatchAlertSweepInterval: ReturnType<typeof setInterval> | null = null;
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
        let activeRouters = routers.filter(r => r.status !== 'maintenance');

        if (activeRouters.length === 0) return { success: 0, fail: 0, timeout: 0 };

        // Adaptive polling: skip routers in back-off or circuit-breaker-open.
        // Healthy routers always pass; unhealthy ones get a longer interval
        // between enqueues to free worker slots for the rest of the fleet.
        const beforeFilter = activeRouters.length;
        activeRouters = activeRouters.filter(r => shouldEnqueueRouter(r.id));
        const skippedAdaptive = beforeFilter - activeRouters.length;
        if (skippedAdaptive > 0) {
            logger.debug({ tenantId, skipped: skippedAdaptive }, 'Adaptive skip: routers in back-off this cycle');
        }
        if (activeRouters.length === 0) return { success: 0, fail: 0, timeout: 0 };

        logger.debug(`🔄 [Tenant: ${tenantId}] Polling ${activeRouters.length} active routers (Skipped ${routers.length - activeRouters.length} in maintenance, ${skippedAdaptive} in back-off)...`);

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

    // Backpressure: bail out if the queue is already saturated. Better to
    // skip one cycle than pile up jobs whose data will be stale by the time
    // they run.
    if (!(await queueHasCapacity())) {
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
 * Uses parameterized queries to prevent SQL injection.
 */
async function batchDeleteSafe(
    table: typeof routerMetrics | typeof devicePerformanceHistory | typeof routerInterfaceMetrics,
    tenantId: string,
    cutoffDate: Date,
    batchSize: number = 5000
): Promise<number> {
    let totalDeleted = 0;
    let deletedInBatch = batchSize;
    const tableName = table === routerMetrics ? 'router_metrics'
        : table === devicePerformanceHistory ? 'device_performance_history'
        : 'router_interface_metrics';

    logger.debug({ tableName, tenantId }, '🧹 Starting batch cleanup...');

    while (deletedInBatch === batchSize) {
        try {
            // Safe: Uses Drizzle's parameterized sql template literal
            // The tenant_id and recorded_at values are properly bound as parameters
            // Pass cutoff as ISO string — JS Date.toString() produces a format
            // PostgreSQL 14 refuses to coerce into a timestamp, causing the
            // delete to fail silently and old metrics to accumulate.
            const cutoffIso = cutoffDate.toISOString();
            const result = await db.execute(
                sql`DELETE FROM ${table}
                    WHERE id IN (
                        SELECT id FROM ${table}
                        WHERE tenant_id = ${tenantId} AND recorded_at < ${cutoffIso}
                        LIMIT ${batchSize}
                    )`
            );
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

            await batchDeleteSafe(routerMetrics, tenant.id, mCutoff);

            // 1b. Device Latency & Signal history (Performance) - HIGH VOLUME
            const perfRetention = await settingsService.getSettingValue('performance_retention_days', tenant.id, 30);
            const pCutoff = new Date();
            pCutoff.setDate(pCutoff.getDate() - perfRetention);

            await batchDeleteSafe(devicePerformanceHistory, tenant.id, pCutoff);

            // 2. Interface traffic metrics - HIGH VOLUME
            const ifMetricsRetention = await settingsService.getSettingValue('interface_metrics_retention_days', tenant.id, 30);
            const ifCutoff = new Date();
            ifCutoff.setDate(ifCutoff.getDate() - ifMetricsRetention);

            await batchDeleteSafe(routerInterfaceMetrics, tenant.id, ifCutoff);

            // 2b. Per-client bandwidth deltas (Phase 1)
            const clientBwRetention = await settingsService.getSettingValue('client_bandwidth_retention_days', tenant.id, 30);
            const cbwCutoff = new Date();
            cbwCutoff.setDate(cbwCutoff.getDate() - clientBwRetention);
            await db.execute(sql`DELETE FROM client_bandwidth_history WHERE tenant_id = ${tenant.id} AND recorded_at < ${cbwCutoff.toISOString()}`);

            // 3. Resolved Alerts (Low volume, usually safe for direct delete)
            const alertsRetention = await settingsService.getSettingValue('alerts_retention_days', tenant.id, 60);
            const aCutoff = new Date();
            aCutoff.setDate(aCutoff.getDate() - alertsRetention);

            // Delete resolved alerts beyond retention.
                        await db.delete(alerts)
                .where(and(
                    eq(alerts.tenantId, tenant.id),
                    eq(alerts.resolved, true),
                    lt(alerts.createdAt, aCutoff)
                ));

            // Also delete UNRESOLVED alerts that are extra-old (2× retention).
            // Without this, alert flood (e.g. packet_loss before cooldown fix) accumulates
            // forever because nobody acknowledges them. 2× window keeps recent unresolved
            // visible for operators while bounding total storage.
            const unackCutoff = new Date();
            unackCutoff.setDate(unackCutoff.getDate() - alertsRetention * 2);
            await db.delete(alerts)
                .where(and(
                    eq(alerts.tenantId, tenant.id),
                    lt(alerts.createdAt, unackCutoff)
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

            // NOTE: pass Date cutoffs as ISO strings — passing JS Date objects
            // directly here caused "Failed query" on PG 14 because Date.toString()
            // produces "Sat Jan 24 2026 21:03:05 GMT+0000 (Coordinated Universal Time)"
            // which PostgreSQL refuses to coerce into a timestamp.
            await db.execute(sql`DELETE FROM router_backups WHERE tenant_id = ${tenant.id} AND created_at < ${bCutoff.toISOString()}`);
            await db.execute(sql`DELETE FROM genieacs_backups WHERE tenant_id = ${tenant.id} AND created_at < ${bCutoff.toISOString()}`);

            // 6. Disconnected PPPoE Sessions
            const pppoeRetention = await settingsService.getSettingValue('pppoe_retention_days', tenant.id, 30);
            const pppCutoff = new Date();
            pppCutoff.setDate(pppCutoff.getDate() - pppoeRetention);

            await db.execute(sql`DELETE FROM pppoe_sessions WHERE tenant_id = ${tenant.id} AND status = 'disconnected' AND last_seen < ${pppCutoff.toISOString()}`);

            // 7. Ghost ONUs — soft-archive offline devices, hard-delete after 2× retention
            const ghostRetention = await settingsService.getSettingValue('ghost_onu_retention_days', tenant.id, 30);
            await oltService.cleanupGhostOnus(tenant.id, ghostRetention);

            // Cleanup finished for tenant
            logger.info({ tenantId: tenant.id }, '✅ Tenant database maintenance complete');
        }

        // Post-loop: Global audit log cleanup (cross-tenant entries dengan
        // tenantId=NULL). Backup ops (export/restore/delete/create) di-audit
        // dengan tenantId=NULL karena scope superadmin. Per-tenant retention
        // loop di atas SKIP entries ini (`eq(tenantId, tenant.id)` filter).
        // Tanpa cleanup terpisah → tabel grow unbounded. Default retention
        // sama dengan per-tenant default (365d).
        //
        // Pattern match per-tenant delete di atas (line 585): TIDAK pakai
        // `.returning()` untuk avoid memory spike kalau ada banyak row
        // ke-delete (per code-review e2b52f0 finding MEDIUM).
        const globalAuditRetention = Number(process.env.GLOBAL_AUDIT_RETENTION_DAYS) || 365;
        const globalAuCutoff = new Date();
        globalAuCutoff.setDate(globalAuCutoff.getDate() - globalAuditRetention);

        await db.delete(auditLogs)
            .where(and(isNull(auditLogs.tenantId), lt(auditLogs.createdAt, globalAuCutoff)));

        logger.info(
            { retentionDays: globalAuditRetention },
            '✅ Global (cross-tenant) audit logs cleanup ran',
        );

        // Ensure future partitions exist
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

    // Billing daily — generate invoices, mark overdue, auto-isolir.
    // Initial run 5 minutes after startup so DB+migrations settle, then once per hour
    // (idempotent: jobs that already ran today are skipped via DB checks).
    setTimeout(() => runBillingJobSafe(), 300000);
    billingDailyInterval = setInterval(() => runBillingJobSafe(), 60 * 60 * 1000);

    // Drift detection — scan PPPoE drift antar DB ↔ MikroTik tiap 1 jam.
    // Initial run 6 menit setelah startup (offset dari billing job 5 menit).
    // Per-tenant scan; router yang offline di-skip, dicatat di routersFailed.
    setTimeout(() => runDriftScanSafe(), 360000);
    driftScanInterval = setInterval(() => runDriftScanSafe(), 60 * 60 * 1000);

    // Netwatch auto-heal — every 5 minutes, walk netwatch entries with
    // linkedOnuId and update host IP if PPPoE/ACS reports a different one.
    // Initial run after 90s so PPPoE polling has populated pppoe_sessions.
    setTimeout(() => runNetwatchAutoHealSafe(), 90000);
    netwatchAutoHealInterval = setInterval(() => runNetwatchAutoHealSafe(), 5 * 60 * 1000);

    // Netwatch alert sweeper — every 5 minutes, resolve netwatch_down alerts
    // whose corresponding netwatch entry is currently UP (catches stale alerts
    // from IP changes, app restart races, deleted entries, etc.).
    setTimeout(() => runNetwatchAlertSweepSafe(), 120000);
    netwatchAlertSweepInterval = setInterval(() => runNetwatchAlertSweepSafe(), 5 * 60 * 1000);
}

async function runBillingJobSafe() {
    try {
        const { runBillingDailyJob } = await import('../services/billing/billing-scheduler.js');
        await runBillingDailyJob();
    } catch (err) {
        logger.error({ err }, 'Billing daily job crashed');
    }
}

async function runDriftScanSafe() {
    try {
        const { driftDetectorService } = await import('../services/billing/drift-detector.service.js');
        const { db } = await import('../db/index.js');
        const { tenants } = await import('../db/schema/index.js');
        const rows = await db.select({ id: tenants.id }).from(tenants);
        for (const t of rows) {
            try {
                await driftDetectorService.scan(t.id);
            } catch (err: any) {
                logger.warn({ err: err?.message, tenantId: t.id }, 'Drift scan failed for tenant');
            }
        }
    } catch (err) {
        logger.error({ err }, 'Drift scan cycle crashed');
    }
}

async function runNetwatchAutoHealSafe() {
    // Kill switch — set NETWATCH_AUTOHEAL_ENABLED=false to disable cycle entirely.
    // In Phase 25, auto-heal is detect-only — it flags conflicts in DB for
    // operator to resolve manually. Set this env var to 'false' if you don't
    // even want the detection cycle to run.
    if (process.env.NETWATCH_AUTOHEAL_ENABLED === 'false') {
        return;
    }
    try {
        const { healStaleEntries } = await import('../services/netwatch/netwatch-autoheal.service.js');
        const result = await healStaleEntries();
        if (result.detected > 0 || result.conflicts > 0 || result.cleared > 0 || result.flapped > 0 || result.failed > 0) {
            logger.info(result, 'Netwatch auto-detect cycle complete');
        }
    } catch (err) {
        logger.error({ err }, 'Netwatch auto-detect crashed');
    }
}

async function runNetwatchAlertSweepSafe() {
    try {
        const { alertService } = await import('../services/alert.service.js');
        await alertService.sweepStaleNetwatchAlerts();
    } catch (err) {
        logger.error({ err }, 'Netwatch alert sweeper crashed');
    }
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
    if (billingDailyInterval) { clearInterval(billingDailyInterval); billingDailyInterval = null; }
    if (driftScanInterval) { clearInterval(driftScanInterval); driftScanInterval = null; }
    if (netwatchAutoHealInterval) { clearInterval(netwatchAutoHealInterval); netwatchAutoHealInterval = null; }
    if (netwatchAlertSweepInterval) { clearInterval(netwatchAlertSweepInterval); netwatchAlertSweepInterval = null; }

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
