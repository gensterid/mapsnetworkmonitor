
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '..', 'apps', 'api', '.env'), override: true });

async function runDiag() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    console.log('📡 Connecting to database for diagnostics...');
    const queryClient = postgres(connectionString);
    const db = drizzle(queryClient);

    try {
        console.log('\n--- [1] Checking Metrics Tables Constraints ---');
        const tsTables = ['device_performance_history', 'router_metrics', 'router_interface_metrics'];
        
        for (const table of tsTables) {
            console.log(`\n🔍 Table: ${table}`);
            
            // 1.1 List existing Primary Keys
            const pks = await db.execute(sql.raw(`
                SELECT conname, pg_get_constraintdef(oid) 
                FROM pg_constraint 
                WHERE conrelid = '${table}'::regclass AND contype = 'p';
            `));
            console.log('   Primary Keys:', pks.length > 0 ? pks : 'None');

            // 1.2 Check for NULL values in PK columns
            const nulls = await db.execute(sql.raw(`
                SELECT 
                    COUNT(*) FILTER (WHERE id IS NULL) as null_id,
                    COUNT(*) FILTER (WHERE recorded_at IS NULL) as null_recorded_at
                FROM ${table};
            `));
            console.table(nulls);

            // 1.3 Check for Duplicates
            const dups = await db.execute(sql.raw(`
                SELECT id, recorded_at, COUNT(*) 
                FROM ${table} 
                GROUP BY id, recorded_at 
                HAVING COUNT(*) > 1 
                LIMIT 5;
            `));
            console.log('   Duplicates found (first 5):', dups.length > 0 ? dups : 'None');

            // 1.4 Test Add PK (with full error capture)
            try {
                console.log(`   Trying test PK establishment for ${table}...`);
                // Use a temporary transaction to try adding PK
                await db.execute(sql.raw(`BEGIN; ALTER TABLE ${table} ADD PRIMARY KEY (id, recorded_at); ROLLBACK;`));
                console.log('   ✅ Test PK establishment succeeded (rolled back).');
            } catch (err: any) {
                console.log(`   ❌ Test PK establishment FAILED: ${err.message}`);
                if (err.detail) console.log(`      Detail: ${err.detail}`);
            }
        }

        console.log('\n--- [2] Checking Migration State ---');
        try {
            const migrations = await db.execute(sql.raw('SELECT * FROM drizzle_migrations;'));
            console.log('   Applied Migrations Count:', migrations.length);
        } catch (err) {
            console.log('   ⚠️ Could not read drizzle_migrations table.');
        }

        console.log('\n--- [3] Checking TimescaleDB Status ---');
        try {
            const hypertables = await db.execute(sql.raw('SELECT hypertable_name FROM _timescaledb_catalog.hypertable;'));
            console.log('   Hypertables:', hypertables.map(h => h.hypertable_name).join(', '));
        } catch (err) {
            console.log('   ⚠️ TimescaleDB metadata not accessible.');
        }

    } catch (err) {
        console.error('❌ Diagnostics failed:', err);
    } finally {
        await queryClient.end();
        console.log('\n✅ Diagnostics complete.');
    }
}

runDiag();
