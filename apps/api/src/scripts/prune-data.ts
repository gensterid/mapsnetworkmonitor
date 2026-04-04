import { config } from 'dotenv';
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, lt, and } from 'drizzle-orm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust env loading
const loadEnv = () => {
    // Try apps/api/.env
    let envPath = path.resolve(process.cwd(), '.env');
    config({ path: envPath });
    if (process.env.DATABASE_URL) return;

    // Try root .env
    envPath = path.resolve(process.cwd(), '../../.env');
    config({ path: envPath });
    if (process.env.DATABASE_URL) return;

    // Try default location for monorepo
    envPath = path.resolve(__dirname, '../../../../.env');
    config({ path: envPath });
};

loadEnv();

if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL not found in .env files.');
    process.exit(1);
}

const DAYS_TO_KEEP = 14;
const CUTOFF_DATE = new Date();
CUTOFF_DATE.setDate(CUTOFF_DATE.getDate() - DAYS_TO_KEEP);

const runPrune = async () => {
    console.log('🧹 Starting Database Pruning (Maintenance)...');
    console.log(`📡 Connecting to database...`);
    console.log(`📅 Deleting metrics/history older than: ${CUTOFF_DATE.toISOString()} (${DAYS_TO_KEEP} days)`);

    try {
        const queryClient = postgres(process.env.DATABASE_URL!);
        const db = drizzle(queryClient);

        // 1. Prune router_metrics
        console.log('📉 Pruning router_metrics...');
        const metricsRes = await db.execute(sql`
            DELETE FROM router_metrics 
            WHERE recorded_at < ${CUTOFF_DATE.toISOString()};
        `);
        console.log(`✅ Deleted ${metricsRes.count || 0} rows from router_metrics.`);

        // 2. Prune device_performance_history
        console.log('📊 Pruning device_performance_history...');
        const perfRes = await db.execute(sql`
            DELETE FROM device_performance_history 
            WHERE recorded_at < ${CUTOFF_DATE.toISOString()};
        `);
        console.log(`✅ Deleted ${perfRes.count || 0} rows from device_performance_history.`);

        // 3. Prune router_interface_history (if exists)
        // Note: router_interfaces table itself only keeps latest, but some systems might have a separate history table.
        // If there's no history table, this is a no-op.
        
        console.log('✨ Cleanup complete! Your database size should reduce after VACUUM.');
        console.log('💡 Tip: Run "VACUUM FULL;" in psql to physically reclaim disk space immediately.');
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Pruning failed:', err);
        process.exit(1);
    }
};

runPrune();
