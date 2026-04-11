import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../lib/logger.js';
import { isRedisAvailable } from '../lib/redis-client.js';

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

    // Interface Traffic Metrics
    public readonly interfaceTrafficTxBps: Gauge;
    public readonly interfaceTrafficRxBps: Gauge;

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
            labelNames: ['status', 'tenant_id', 'router_id', 'router_name'],
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
            labelNames: ['severity', 'type', 'tenant_id', 'router_id', 'router_name'],
            registers: [this.registry]
        });

        this.pppoeSessionsActiveCount = new Gauge({
            name: 'app_pppoe_sessions_active_count',
            help: 'Number of active PPPoE sessions by tenant and router',
            labelNames: ['tenant_id', 'router_id', 'router_name'],
            registers: [this.registry]
        });

        this.routerBackupsTotal = new Gauge({
            name: 'app_router_backups_total',
            help: 'Total number of router backups by type and tenant',
            labelNames: ['type', 'tenant_id', 'router_id', 'router_name'],
            registers: [this.registry]
        });

        this.netwatchHostsStatusCount = new Gauge({
            name: 'app_netwatch_hosts_status_count',
            help: 'Number of netwatch hosts by status and tenant',
            labelNames: ['status', 'tenant_id', 'router_id', 'router_name'],
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

        this.interfaceTrafficTxBps = new Gauge({
            name: 'app_interface_traffic_tx_bps',
            help: 'Interface TX rate in bits per second',
            labelNames: ['router_id', 'router_name', 'interface_name', 'tenant_id'],
            registers: [this.registry]
        });

        this.interfaceTrafficRxBps = new Gauge({
            name: 'app_interface_traffic_rx_bps',
            help: 'Interface RX rate in bits per second',
            labelNames: ['router_id', 'router_name', 'interface_name', 'tenant_id'],
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
     */
    public async updateSystemGauges() {
        try {
            const { db } = await import('../db/index.js');
            const { routers, olts, onus, alerts, pppoeSessions, routerBackups, netwatchHosts, users, tenants, routerInterfaces } = await import('../db/schema/index.js');
            const { sql, count, eq } = await import('drizzle-orm');

            // 1. Router Statuses
            const routerStats = await db.select({
                tenantId: routers.tenantId,
                routerId: routers.id,
                routerName: routers.name,
                status: routers.status,
            }).from(routers);

            this.deviceRouterStatusCount.reset();
            for (const stat of routerStats) {
                this.deviceRouterStatusCount.set(
                    { 
                        tenant_id: stat.tenantId || 'none', 
                        router_id: stat.routerId, 
                        router_name: stat.routerName || 'unknown', 
                        status: stat.status || 'unknown' 
                    },
                    1
                );
            }

            // 2. OLT Statuses (Grouped by tenant)
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

            // 3. ONU Statuses (Grouped by tenant)
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

            // 4. Alerts (Unresolved, Per Router)
            const alertStats = await db.select({
                tenantId: alerts.tenantId,
                routerId: alerts.routerId,
                routerName: routers.name,
                severity: alerts.severity,
                type: alerts.type,
                count: count()
            }).from(alerts)
                .leftJoin(routers, eq(alerts.routerId, routers.id))
                .where(eq(alerts.resolved, false))
                .groupBy(alerts.tenantId, alerts.routerId, routers.name, alerts.severity, alerts.type);

            this.alertCount.reset();
            for (const stat of alertStats) {
                this.alertCount.set(
                    { 
                        tenant_id: stat.tenantId || 'none', 
                        router_id: stat.routerId || 'none', 
                        router_name: stat.routerName || 'system',
                        severity: stat.severity, 
                        type: stat.type 
                    },
                    stat.count
                );
            }

            // 5. PPPoE Sessions (Active, Per Router)
            // Simplified query to avoid potential join complexities in some PG versions
            const pppoeStats = await db.select({
                tenantId: pppoeSessions.tenantId,
                routerId: pppoeSessions.routerId,
                count: count()
            }).from(pppoeSessions)
                .where(eq(pppoeSessions.status, 'active'))
                .groupBy(pppoeSessions.tenantId, pppoeSessions.routerId);

            this.pppoeSessionsActiveCount.reset();
            for (const stat of pppoeStats) {
                // Get router name from cached state if possible, or just use ID
                this.pppoeSessionsActiveCount.set(
                    { 
                        tenant_id: stat.tenantId || 'none', 
                        router_id: stat.routerId || 'none',
                        router_name: 'active_sessions' // Using a generic label to avoid join error
                    },
                    stat.count
                );
            }

            // 6. Router Backups (Per Router)
            const backupStats = await db.select({
                tenantId: routerBackups.tenantId,
                routerId: routerBackups.routerId,
                routerName: routers.name,
                type: routerBackups.type,
                count: count()
            }).from(routerBackups)
                .leftJoin(routers, eq(routerBackups.routerId, routers.id))
                .groupBy(routerBackups.tenantId, routerBackups.routerId, routers.name, routerBackups.type);

            this.routerBackupsTotal.reset();
            for (const stat of backupStats) {
                this.routerBackupsTotal.set(
                    { 
                        tenant_id: stat.tenantId || 'none', 
                        router_id: stat.routerId || 'none',
                        router_name: stat.routerName || 'unknown',
                        type: stat.type 
                    },
                    stat.count
                );
            }

            // 7. Netwatch Hosts (Per Router)
            const netwatchStats = await db.select({
                tenantId: netwatchHosts.tenantId,
                routerId: netwatchHosts.routerId,
                routerName: routers.name,
                status: netwatchHosts.status,
                count: count()
            }).from(netwatchHosts)
                .leftJoin(routers, eq(netwatchHosts.routerId, routers.id))
                .groupBy(netwatchHosts.tenantId, netwatchHosts.routerId, routers.name, netwatchHosts.status);

            this.netwatchHostsStatusCount.reset();
            for (const stat of netwatchStats) {
                this.netwatchHostsStatusCount.set(
                    { 
                        tenant_id: stat.tenantId || 'none', 
                        router_id: stat.routerId || 'none',
                        router_name: stat.routerName || 'unknown',
                        status: stat.status || 'unknown' 
                    },
                    stat.count
                );
            }

            // 8. Interface Traffic (Real-time Rates)
            const ifStats = await db.select({
                routerId: routerInterfaces.routerId,
                routerName: routers.name,
                interfaceName: routerInterfaces.name,
                txRate: routerInterfaces.txRate,
                rxRate: routerInterfaces.rxRate,
                tenantId: routers.tenantId
            }).from(routerInterfaces)
              .leftJoin(routers, eq(routerInterfaces.routerId, routers.id));

            this.interfaceTrafficTxBps.reset();
            this.interfaceTrafficRxBps.reset();
            for (const stat of ifStats) {
                const labels = {
                    router_id: stat.routerId,
                    router_name: stat.routerName || 'unknown',
                    interface_name: stat.interfaceName,
                    tenant_id: stat.tenantId || 'none'
                };
                this.interfaceTrafficTxBps.set(labels, stat.txRate || 0);
                this.interfaceTrafficRxBps.set(labels, stat.rxRate || 0);
            }

            // 9. System Totals (Users & Tenants)
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
        if (!isRedisAvailable()) {
            // logger.debug('Skipping queue metrics: Redis not available');
            return;
        }

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
