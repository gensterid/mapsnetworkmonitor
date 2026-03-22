import 'dotenv/config';
import { db } from '../db/index.js';
import { sql, count, eq, desc } from 'drizzle-orm';
import { alerts, routerMetrics, routerInterfaceMetrics, devicePerformanceHistory, tenants } from '../db/schema/index.js';
import { getRedisConnection } from '../lib/redis-client.js';
import { routerSyncQueue } from '../services/queue.service.js';

async function checkHealth() {
    console.log('🔍 Starting System Health Check...\n');

    // 1. Check Redis
    console.log('--- 1. Redis Connection ---');
    try {
        const redis = getRedisConnection();
        const ping = await redis.ping();
        console.log(`✅ Redis Status: ${ping}`);
    } catch (err: any) {
        console.error(`❌ Redis Connection Failed: ${err.message}`);
    }
    console.log('');

    // 2. Check Database Partitions
    console.log('--- 2. Database Partitions ---');
    const managedTables = [
        'router_metrics',
        'router_interface_metrics',
        'device_performance_history'
    ];

    for (const table of managedTables) {
        try {
            const partitions = await db.execute(sql.raw(`
                SELECT
                    child.relname AS partition_name,
                    pg_get_expr(child.relpartbound, child.oid) AS partition_expression
                FROM pg_inherits
                JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
                JOIN pg_class child ON pg_inherits.inhrelid = child.oid
                WHERE parent.relname = '${table}'
                ORDER BY child.relname DESC
                LIMIT 3;
            `));

            if (partitions.length === 0) {
                console.warn(`⚠️ Table "${table}" has NO partitions! This will cause monitoring to FAIL.`);
            } else {
                console.log(`✅ Table "${table}" has ${partitions.length} recent partitions:`);
                partitions.forEach((p: any) => console.log(`   - ${p.partition_name} (${p.partition_expression})`));
            }
        } catch (err: any) {
            console.error(`❌ Failed to check partitions for ${table}: ${err.message}`);
        }
    }
    console.log('');

    // 3. Check Data Freshness
    console.log('--- 3. Data Freshness (Last 48 Hours) ---');
    try {
        const [lastAlert] = await db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(1);
        console.log(`📡 Last Alert Created: ${lastAlert ? lastAlert.createdAt.toISOString() : 'Never'}`);
        if (lastAlert && (Date.now() - lastAlert.createdAt.getTime() > 24 * 60 * 60 * 1000)) {
            console.warn('⚠️ Alerting might be STALLED (no new alerts in > 24h)');
        }

        const [lastMetric] = await db.select().from(routerMetrics).orderBy(desc(routerMetrics.recordedAt)).limit(1);
        console.log(`📊 Last Router Metric: ${lastMetric ? lastMetric.recordedAt.toISOString() : 'Never'}`);

        const [lastIfaceMetric] = await db.select().from(routerInterfaceMetrics).orderBy(desc(routerInterfaceMetrics.recordedAt)).limit(1);
        console.log(`📈 Last Interface Metric: ${lastIfaceMetric ? lastIfaceMetric.recordedAt.toISOString() : 'Never'}`);
    } catch (err: any) {
        console.error(`❌ Data Freshness Check Failed: ${err.message}`);
    }
    console.log('');

    // 4. Check Queue Status
    console.log('--- 4. BullMQ Queue Status ---');
    try {
        const counts = await routerSyncQueue.getJobCounts();
        console.log('📋 router-sync Queue:');
        console.log(`   - Waiting: ${counts.waiting}`);
        console.log(`   - Active: ${counts.active}`);
        console.log(`   - Completed: ${counts.completed}`);
        console.log(`   - Failed: ${counts.failed}`);
        console.log(`   - Delayed: ${counts.delayed}`);

        if (counts.waiting > 100) {
            console.warn(`⚠️ High number of waiting jobs (${counts.waiting}). Workers might be STUCK.`);
        }
    } catch (err: any) {
        console.error(`❌ Queue Status Check Failed: ${err.message}`);
    }
    console.log('');

    console.log('🏁 Health Check Finished.');
    process.exit(0);
}

checkHealth().catch(err => {
    console.error('💥 Fatal error during health check:', err);
    process.exit(1);
});
