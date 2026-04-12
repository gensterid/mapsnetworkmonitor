
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust env loading
const searchPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'apps', 'api', '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
    path.join(__dirname, '..', '..', '..', '..', '.env'),
];

for (const p of searchPaths) {
    dotenv.config({ path: p });
    if (process.env.DATABASE_URL) {
        console.log(`✅ Loaded env from: ${p}`);
        break;
    }
}

async function runDeepDiag() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    console.log('📡 Connecting to database for Deep Meta Diagnostics...');
    const queryClient = postgres(connectionString);
    const db = drizzle(queryClient);

    const tsTables = ['device_performance_history', 'router_metrics', 'router_interface_metrics'];

    try {
        for (const table of tsTables) {
            console.log(`\n🔍 Analyzing Table: ${table}`);

            // 1. Check TimescaleDB catalog for constraints
            try {
                const chunkConstraints = await db.execute(sql.raw(`
                    SELECT 
                        c.table_name as chunk_name,
                        cc.constraint_name,
                        cc.hypertable_constraint_name as parent_constraint_name
                    FROM _timescaledb_catalog.chunk_constraint cc
                    JOIN _timescaledb_catalog.chunk c ON cc.chunk_id = c.id
                    JOIN _timescaledb_catalog.hypertable h ON c.hypertable_id = h.id
                    WHERE h.table_name = '${table}';
                `));
                console.log('   Chunk Constraints (from TimescaleDB catalog):');
                console.table(chunkConstraints);
            } catch (e) { console.log('   ⚠️ Could not read TimescaleDB chunk_constraint catalog'); }

            // 2. Check for UNIQUE indices that aren't constraints
            try {
                const uniqueIndices = await db.execute(sql.raw(`
                    SELECT indexname, indexdef
                    FROM pg_indexes 
                    WHERE tablename = '${table}' AND indexdef LIKE '%UNIQUE%';
                `));
                console.log('   Unique Indices:');
                console.table(uniqueIndices);
            } catch (e) { console.log('   ⚠️ Could not read pg_indexes'); }
        }

    } catch (err) {
        console.error('❌ Deep Diagnostics failed:', err);
    } finally {
        await queryClient.end();
    }
}

runDeepDiag();
