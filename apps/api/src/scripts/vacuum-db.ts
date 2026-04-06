import { config } from 'dotenv';
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, and, lt, eq } from 'drizzle-orm';
import { 
    routerMetrics, 
    routerInterfaceMetrics, 
    devicePerformanceHistory, 
    alerts, 
    appSettings as settings,
    tenants,
    auditLogs
} from '../db/schema/index.js';

/**
 * Database Optimization & Vacuum Script
 * This script:
 * 1. Updates retention settings to more conservative values.
 * 2. Purges old data according to new policies.
 * 3. Runs VACUUM ANALYZE to reclaim disk space.
 */

// Load env
config({ path: path.resolve(process.cwd(), '.env') });
config({ path: path.resolve(process.cwd(), '../../.env') });

const runOptimization = async () => {
    console.log('🧹 Starting Database Optimization & Cleanup...');
    
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const queryClient = postgres(process.env.DATABASE_URL);
    const db = drizzle(queryClient);

    try {
        // 1. UPDATE RETENTION SETTINGS
        console.log('⚙️ Updating retention policies for all tenants...');
        const allTenants = await db.select().from(tenants);
        
        for (const tenant of allTenants) {
            const updates = [
                { key: 'metrics_retention_days', value: 14 },
                { key: 'interface_metrics_retention_days', value: 7 },
                { key: 'performance_retention_days', value: 14 },
                { key: 'alerts_retention_days', value: 30 }
            ];

            for (const item of updates) {
                await db.insert(settings)
                    .values({
                        tenantId: tenant.id,
                        key: item.key,
                        value: item.value,
                        updatedAt: new Date()
                    })
                    .onConflictDoUpdate({
                        target: [settings.tenantId, settings.key],
                        set: { value: item.value, updatedAt: new Date() }
                    });
            }
        }
        console.log('✅ Retention policies updated.');

        // 2. IMMEDIATE PURGE based on new policies
        console.log('🗑️ Purging excessive historical records...');
        
        const cutoffs = {
            metrics: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
            interfaces: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            alerts: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        };

        const resultMetrics = await db.delete(routerMetrics).where(lt(routerMetrics.recordedAt, cutoffs.metrics));
        console.log(`- Cleared old router metrics.`);

        const resultIf = await db.delete(routerInterfaceMetrics).where(lt(routerInterfaceMetrics.recordedAt, cutoffs.interfaces));
        console.log(`- Cleared old interface traffic.`);

        const resultPerf = await db.delete(devicePerformanceHistory).where(lt(devicePerformanceHistory.recordedAt, cutoffs.metrics));
        console.log(`- Cleared old performance history.`);

        const resultAlerts = await db.delete(alerts).where(and(eq(alerts.resolved, true), lt(alerts.createdAt, cutoffs.alerts)));
        console.log(`- Cleared old resolved alerts.`);

        // 3. VACUUM ANALYZE (Reclaim disk space)
        console.log('⚡ Running VACUUM ANALYZE (this may take a few minutes)...');
        await db.execute(sql`VACUUM ANALYZE;`);
        
        // 4. Report Final Sizes
        const dbSize = await db.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) as size;`);
        console.log(`🎉 Optimization complete! Current Database Size: ${dbSize[0]?.size}`);

        process.exit(0);
    } catch (err: any) {
        console.error('❌ Optimization failed:', err.message);
        process.exit(1);
    }
};

runOptimization();
