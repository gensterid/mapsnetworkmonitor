import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../lib/logger.js';

export class MetricsService {
    private static instance: MetricsService;
    private registry: Registry;

    // --- Metrics Definitions ---
    
    // HTTP Metrics
    public readonly httpRequestTotal: Counter;
    public readonly httpRequestDuration: Histogram;

    // Device Status Metrics
    public readonly deviceRouterStatusCount: Gauge;
    public readonly deviceOltStatusCount: Gauge;
    public readonly deviceOnuStatusCount: Gauge;

    // Queue Metrics (BullMQ)
    public readonly queueSizeGauge: Gauge;

    // Expanded Application Metrics
    public readonly alertCount: Gauge;
    public readonly pppoeSessionsActiveCount: Gauge;
    public readonly routerBackupsTotal: Gauge;
    public readonly netwatchHostsStatusCount: Gauge;
    public readonly systemUserCount: Gauge;
    public readonly systemTenantCount: Gauge;

    private constructor() {
        this.registry = new Registry();
        this.registry.setDefaultLabels({
            app: 'maps-network-monitor-api'
        });

        // Collect default Node.js metrics (CPU, RAM, Event Loop, etc.)
        collectDefaultMetrics({ register: this.registry });

        // Initialize custom metrics
        this.httpRequestTotal = new Counter({
            name: 'http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status'],
            registers: [this.registry]
        });

        this.httpRequestDuration = new Histogram({
            name: 'http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route', 'status'],
            buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
            registers: [this.registry]
        });

        this.deviceRouterStatusCount = new Gauge({
            name: 'device_router_status_count',
            help: 'Number of routers by status',
            labelNames: ['status', 'tenant_id'],
            registers: [this.registry]
        });

        this.deviceOltStatusCount = new Gauge({
            name: 'device_olt_status_count',
            help: 'Number of OLTs by status',
            labelNames: ['status', 'tenant_id'],
            registers: [this.registry]
        });

        this.deviceOnuStatusCount = new Gauge({
            name: 'device_onu_status_count',
            help: 'Number of ONUs by status',
            labelNames: ['status', 'tenant_id'],
            registers: [this.registry]
        });

        this.queueSizeGauge = new Gauge({
            name: 'queue_jobs_count',
            help: 'Number of jobs in BullMQ queues',
            labelNames: ['queue_name', 'status'],
            registers: [this.registry]
        });

        this.alertCount = new Gauge({
            name: 'app_alert_count',
            help: 'Number of unresolved alerts by severity and type',
            labelNames: ['severity', 'type', 'tenant_id'],
            registers: [this.registry]
        });

        this.pppoeSessionsActiveCount = new Gauge({
            name: 'app_pppoe_sessions_active_count',
            help: 'Number of active PPPoE sessions by tenant',
            labelNames: ['tenant_id'],
            registers: [this.registry]
        });

        this.routerBackupsTotal = new Gauge({
            name: 'app_router_backups_total',
            help: 'Total number of router backups by type and tenant',
            labelNames: ['type', 'tenant_id'],
            registers: [this.registry]
        });

        this.netwatchHostsStatusCount = new Gauge({
            name: 'app_netwatch_hosts_status_count',
            help: 'Number of netwatch hosts by status and tenant',
            labelNames: ['status', 'tenant_id'],
            registers: [this.registry]
        });

        this.systemUserCount = new Gauge({
            name: 'app_system_user_count',
            help: 'Total number of users in the system',
            registers: [this.registry]
        });

        this.systemTenantCount = new Gauge({
            name: 'app_system_tenant_count',
            help: 'Total number of tenants in the system',
            registers: [this.registry]
        });

        // Start periodic updates
        this.updateSystemGauges();
        this.updateQueueGauges();
        setInterval(() => {
            this.updateSystemGauges();
            this.updateQueueGauges();
        }, 30000); // Every 30 seconds
    }

    public static getInstance(): MetricsService {
        if (!MetricsService.instance) {
            MetricsService.instance = new MetricsService();
        }
        return MetricsService.instance;
    }

    public async getMetrics(): Promise<string> {
        return this.registry.metrics();
    }

    public getContentType(): string {
        return this.registry.contentType;
    }

    /**
     * Update system-wide Gauges from Database state
     * This should be called periodically by the scheduler
     */
    public async updateSystemGauges() {
        try {
            const { db } = await import('../db/index.js');
            const { routers, olts, onus } = await import('../db/schema/index.js');
            const { sql, count, eq } = await import('drizzle-orm');

            // 1. Router Statuses
            const routerStats = await db.select({
                tenantId: routers.tenantId,
                status: routers.status,
                count: count()
            }).from(routers).groupBy(routers.tenantId, routers.status);

            this.deviceRouterStatusCount.reset();
            for (const stat of routerStats) {
                this.deviceRouterStatusCount.set(
                    { tenant_id: stat.tenantId || 'none', status: stat.status || 'unknown' },
                    stat.count
                );
            }

            // 2. OLT Statuses
            const oltStats = await db.select({
                tenantId: olts.tenantId,
                status: olts.status,
                count: count()
            }).from(olts).groupBy(olts.tenantId, olts.status);

            this.deviceOltStatusCount.reset();
            for (const stat of oltStats) {
                this.deviceOltStatusCount.set(
                    { tenant_id: stat.tenantId || 'none', status: stat.status || 'unknown' },
                    stat.count
                );
            }

            // 3. ONU Statuses
            const onuStats = await db.select({
                tenantId: onus.tenantId,
                status: onus.status,
                count: count()
            }).from(onus).groupBy(onus.tenantId, onus.status);

            this.deviceOnuStatusCount.reset();
            for (const stat of onuStats) {
                this.deviceOnuStatusCount.set(
                    { tenant_id: stat.tenantId || 'none', status: stat.status || 'unknown' },
                    stat.count
                );
            }

            // 4. Alerts (Unresolved)
            const { alerts } = await import('../db/schema/index.js');
            const alertStats = await db.select({
                tenantId: alerts.tenantId,
                severity: alerts.severity,
                type: alerts.type,
                count: count()
            }).from(alerts)
                .where(eq(alerts.resolved, false))
                .groupBy(alerts.tenantId, alerts.severity, alerts.type);

            this.alertCount.reset();
            for (const stat of alertStats) {
                this.alertCount.set(
                    { tenant_id: stat.tenantId || 'none', severity: stat.severity, type: stat.type },
                    stat.count
                );
            }

            // 5. PPPoE Sessions (Active)
            const { pppoeSessions } = await import('../db/schema/index.js');
            const pppoeStats = await db.select({
                tenantId: pppoeSessions.tenantId,
                count: count()
            }).from(pppoeSessions)
                .where(eq(pppoeSessions.status, 'active'))
                .groupBy(pppoeSessions.tenantId);

            this.pppoeSessionsActiveCount.reset();
            for (const stat of pppoeStats) {
                this.pppoeSessionsActiveCount.set(
                    { tenant_id: stat.tenantId || 'none' },
                    stat.count
                );
            }

            // 6. Router Backups
            const { routerBackups } = await import('../db/schema/index.js');
            const backupStats = await db.select({
                tenantId: routerBackups.tenantId,
                type: routerBackups.type,
                count: count()
            }).from(routerBackups)
                .groupBy(routerBackups.tenantId, routerBackups.type);

            this.routerBackupsTotal.reset();
            for (const stat of backupStats) {
                this.routerBackupsTotal.set(
                    { tenant_id: stat.tenantId || 'none', type: stat.type },
                    stat.count
                );
            }

            // 7. Netwatch Hosts
            const { netwatchHosts } = await import('../db/schema/index.js');
            const netwatchStats = await db.select({
                tenantId: netwatchHosts.tenantId,
                status: netwatchHosts.status,
                count: count()
            }).from(netwatchHosts)
                .groupBy(netwatchHosts.tenantId, netwatchHosts.status);

            this.netwatchHostsStatusCount.reset();
            for (const stat of netwatchStats) {
                this.netwatchHostsStatusCount.set(
                    { tenant_id: stat.tenantId || 'none', status: stat.status || 'unknown' },
                    stat.count
                );
            }

            // 8. System Totals (Users & Tenants)
            const { users, tenants } = await import('../db/schema/index.js');
            const [uCount] = await db.select({ count: count() }).from(users);
            const [tCount] = await db.select({ count: count() }).from(tenants);

            this.systemUserCount.set(uCount.count);
            this.systemTenantCount.set(tCount.count);

        } catch (err) {
            logger.error({ err }, 'Failed to update system metrics Gauges');
        }
    }

    /**
     * Update Queue Gauges from BullMQ state
     */
    public async updateQueueGauges() {
        try {
            const { routerSyncQueue, oltSyncQueue } = await import('./queue.service.js');
            
            // 1. Router Sync Queue
            const rCounts = await routerSyncQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
            this.queueSizeGauge.set({ queue_name: 'router-sync', status: 'waiting' }, rCounts.waiting);
            this.queueSizeGauge.set({ queue_name: 'router-sync', status: 'active' }, rCounts.active);
            this.queueSizeGauge.set({ queue_name: 'router-sync', status: 'completed' }, rCounts.completed);
            this.queueSizeGauge.set({ queue_name: 'router-sync', status: 'failed' }, rCounts.failed);
            this.queueSizeGauge.set({ queue_name: 'router-sync', status: 'delayed' }, rCounts.delayed);

            // 2. OLT Sync Queue
            const oCounts = await oltSyncQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
            this.queueSizeGauge.set({ queue_name: 'olt-sync', status: 'waiting' }, oCounts.waiting);
            this.queueSizeGauge.set({ queue_name: 'olt-sync', status: 'active' }, oCounts.active);
            this.queueSizeGauge.set({ queue_name: 'olt-sync', status: 'completed' }, oCounts.completed);
            this.queueSizeGauge.set({ queue_name: 'olt-sync', status: 'failed' }, oCounts.failed);
            this.queueSizeGauge.set({ queue_name: 'olt-sync', status: 'delayed' }, oCounts.delayed);

        } catch (err) {
            logger.error({ err }, 'Failed to update queue metrics Gauges');
        }
    }
}

export const metricsService = MetricsService.getInstance();
