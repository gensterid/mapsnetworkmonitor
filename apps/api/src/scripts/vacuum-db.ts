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
    auditLogs,
    routerBackups,
    genieacsBackups,
    pppoeSessions
} from '../db/schema/index.js';

/**
 * Database Optimization & Vacuum Script (Safe Mode)
 * This script:
 * 1. Fetches current dashboard settings per tenant.
 * 2. Purges old data ONLY if it exceeds the configured retention.
 * 3. Runs VACUUM ANALYZE to reclaim disk space.
 */

// Load env
config({ path: path.resolve(process.cwd(), '.env') });
config({ path: path.resolve(process.cwd(), '../../.env') });

const runOptimization = async () => {
    console.log('🧹 Starting Database Optimization & Cleanup (Dashboard Focused)...');
    
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const queryClient = postgres(process.env.DATABASE_URL);
    const db = drizzle(queryClient);

    const getRetentionValue = async (tenantId: string, key: string, defaultValue: number) => {
        try {
            const result = await db.select()
                .from(settings)
                .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)))
                .limit(1);
            return result.length > 0 ? Number(result[0].value) : defaultValue;
        } catch {
            return defaultValue;
        }
    };

    try {
        const allTenants = await db.select().from(tenants);
        console.log(`📡 Processing ${allTenants.length} tenants...`);

        for (const tenant of allTenants) {
            console.log(`🔍 [Tenant: ${tenant.name || tenant.id}] Evaluating data age...`);

            // 1. Fetch current dashboard settings (Respecting User Choice)
            const days = {
                metrics: await getRetentionValue(tenant.id, 'metrics_retention_days', 90),
                traffic: await getRetentionValue(tenant.id, 'interface_metrics_retention_days', 90),
                performance: await getRetentionValue(tenant.id, 'performance_retention_days', 90),
                alerts: await getRetentionValue(tenant.id, 'alerts_retention_days', 60),
                backups: await getRetentionValue(tenant.id, 'backups_retention_days', 90),
                pppoe: await getRetentionValue(tenant.id, 'pppoe_retention_days', 30)
            };

            const tenantLabel = tenant.name || tenant.id;
            console.log(`- Policy for ${tenantLabel}: Metrics ${days.metrics}d, Traffic ${days.traffic}d, Backups ${days.backups}d, PPPoE ${days.pppoe}d.`);

            // 2. Calculate cutoffs
            const cutoffs = {
                metrics: new Date(Date.now() - days.metrics * 24 * 60 * 60 * 1000),
                traffic: new Date(Date.now() - days.traffic * 24 * 60 * 60 * 1000),
                performance: new Date(Date.now() - days.performance * 24 * 60 * 60 * 1000),
                alerts: new Date(Date.now() - days.alerts * 24 * 60 * 60 * 1000),
                backups: new Date(Date.now() - days.backups * 24 * 60 * 60 * 1000),
                pppoe: new Date(Date.now() - days.pppoe * 24 * 60 * 60 * 1000)
            };

            // 3. Selective Purge (only if older than dashboard setting)
            // Using Type-Safe Drizzle Delete
            const [delMet, delTra, delPer, delAle, delBac, delPpp] = await Promise.all([
                db.delete(routerMetrics).where(and(eq(routerMetrics.tenantId, tenant.id), lt(routerMetrics.recordedAt, cutoffs.metrics))),
                db.delete(routerInterfaceMetrics).where(and(eq(routerInterfaceMetrics.tenantId, tenant.id), lt(routerInterfaceMetrics.recordedAt, cutoffs.traffic))),
                db.delete(devicePerformanceHistory).where(and(eq(devicePerformanceHistory.tenantId, tenant.id), lt(devicePerformanceHistory.recordedAt, cutoffs.performance))),
                db.delete(alerts).where(and(eq(alerts.tenantId, tenant.id), eq(alerts.resolved, true), lt(alerts.createdAt, cutoffs.alerts))),
                db.delete(routerBackups).where(and(eq(routerBackups.tenantId, tenant.id), lt(routerBackups.createdAt, cutoffs.backups))),
                db.delete(pppoeSessions).where(and(eq(pppoeSessions.tenantId, tenant.id), eq(pppoeSessions.status, 'disconnected'), lt(pppoeSessions.lastSeen, cutoffs.pppoe)))
            ]);
            
            console.log(`✅ [Tenant: ${tenantLabel}] Data older than threshold cleared.`);
        }

        // Global GenieACS Backup Purge (Metadata snapshots)
        const globalBackupsCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        await db.delete(genieacsBackups).where(lt(genieacsBackups.createdAt, globalBackupsCutoff));
        console.log('- Cleared global GenieACS snapshots older than 90 days.');

        // 4. VACUUM ANALYZE (Global reclamation)
        console.log('⚡ Running VACUUM ANALYZE to reclaim disk space (Finalizing Safe Cleanup)...');
        await db.execute(sql`VACUUM ANALYZE;`);
        
        const dbSizeQuery = await db.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) as size;`);
        console.log(`🎉 Optimization complete! Current Database Size: ${dbSizeQuery[0]?.size}`);

        process.exit(0);
    } catch (err: any) {
        console.error('❌ Optimization failed safely:', err.message);
        process.exit(1);
    }
};

runOptimization();
