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

const BATCH_SIZE = 5000;
const SLEEP_MS = 500;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const batchDelete = async (db: any, tableName: string, cutoffDate: string) => {
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
        // We use a subquery to select a chunk of IDs to avoid locking the entire table
        // This is safe even with composite PKs because we filter by the partition key (recorded_at)
        const result = await db.execute(sql`
            WITH target_rows AS (
                SELECT id, recorded_at
                FROM ${sql.identifier(tableName)}
                WHERE recorded_at < ${cutoffDate}
                LIMIT ${BATCH_SIZE}
            )
            DELETE FROM ${sql.identifier(tableName)}
            WHERE (id, recorded_at) IN (SELECT id, recorded_at FROM target_rows);
        `);

        const count = result.count || 0;
        totalDeleted += count;
        
        if (count > 0) {
            console.log(`   🔸 [${tableName}] Deleted ${count} rows... Total: ${totalDeleted}`);
            await sleep(SLEEP_MS);
        }
        
        hasMore = count === BATCH_SIZE;
    }
    return totalDeleted;
};

const runPrune = async () => {
    console.log('🧹 Starting Database Pruning (Maintenance)...');
    console.log(`📡 Connecting to database...`);
    console.log(`📅 Deleting metrics/history older than: ${CUTOFF_DATE.toISOString()} (${DAYS_TO_KEEP} days)`);

    let queryClient;
    try {
        queryClient = postgres(process.env.DATABASE_URL!, { max: 1 });
        const db = drizzle(queryClient);

        // 1. Prune router_metrics
        console.log('📉 Pruning router_metrics...');
        const metricsCount = await batchDelete(db, 'router_metrics', CUTOFF_DATE.toISOString());
        console.log(`✅ Finished: Deleted ${metricsCount} total rows from router_metrics.`);

        // 2. Prune device_performance_history
        console.log('📊 Pruning device_performance_history...');
        const perfCount = await batchDelete(db, 'device_performance_history', CUTOFF_DATE.toISOString());
        console.log(`✅ Finished: Deleted ${perfCount} total rows from device_performance_history.`);

        console.log('✨ Cleanup complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Pruning failed:', err);
        process.exit(1);
    } finally {
        if (queryClient) await queryClient.end();
    }
};

runPrune();
