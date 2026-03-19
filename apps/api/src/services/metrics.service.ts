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
    public readonly routerStatusGauge: Gauge;
    public readonly oltStatusGauge: Gauge;
    public readonly onuStatusGauge: Gauge;

    // Queue Metrics (BullMQ)
    public readonly queueSizeGauge: Gauge;

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

        this.routerStatusGauge = new Gauge({
            name: 'device_router_status_count',
            help: 'Number of routers by status',
            labelNames: ['status', 'tenant_id'],
            registers: [this.registry]
        });

        this.oltStatusGauge = new Gauge({
            name: 'device_olt_status_count',
            help: 'Number of OLTs by status',
            labelNames: ['status', 'tenant_id'],
            registers: [this.registry]
        });

        this.onuStatusGauge = new Gauge({
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

            this.routerStatusGauge.reset();
            for (const stat of routerStats) {
                this.routerStatusGauge.set(
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

            this.oltStatusGauge.reset();
            for (const stat of oltStats) {
                this.oltStatusGauge.set(
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

            this.onuStatusGauge.reset();
            for (const stat of onuStats) {
                this.onuStatusGauge.set(
                    { tenant_id: stat.tenantId || 'none', status: stat.status || 'unknown' },
                    stat.count
                );
            }

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
