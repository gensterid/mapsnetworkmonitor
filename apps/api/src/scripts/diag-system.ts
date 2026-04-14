
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
            
            // 1.1 List all constraints
            try {
                const constraints = await db.execute(sql.raw(`
                    SELECT conname as name, contype as type, pg_get_constraintdef(oid) as definition
                    FROM pg_constraint 
                    WHERE conrelid = '${table}'::regclass;
                `));
                console.log('   Constraints:');
                console.table(constraints);
            } catch (e) { console.log('   ⚠️ Could not list constraints'); }

            // 1.2 List all indices
            try {
                const indices = await db.execute(sql.raw(`
                    SELECT indexname as name, indexdef as definition
                    FROM pg_indexes 
                    WHERE tablename = '${table}';
                `));
                console.log('   Indices:');
                console.table(indices);
            } catch (e) { console.log('   ⚠️ Could not list indices'); }

            // 1.3 Check for NULL values in PK columns
            try {
                const nulls = await db.execute(sql.raw(`
                    SELECT 
                        COUNT(*) as total_rows,
                        COUNT(*) FILTER (WHERE id IS NULL) as null_id,
                        COUNT(*) FILTER (WHERE recorded_at IS NULL) as null_recorded_at
                    FROM ${table};
                `));
                console.table(nulls);
            } catch (e) { console.log('   ⚠️ Could not check for NULLs'); }

            // 1.4 Check for Duplicates
            try {
                const dups = await db.execute(sql.raw(`
                    SELECT id, recorded_at, COUNT(*) 
                    FROM ${table} 
                    GROUP BY id, recorded_at 
                    HAVING COUNT(*) > 1 
                    LIMIT 5;
                `));
                console.log('   Duplicates found (first 5):', dups.length > 0 ? dups : 'None');
            } catch (e) { console.log('   ⚠️ Could not check for duplicates'); }

            // 1.5 Test Add PK (with full error capture, OUTSIDE main transaction)
            try {
                console.log(`   Trying test PK establishment for ${table}...`);
                const testClient = postgres(connectionString);
                try {
                   await testClient.unsafe(`ALTER TABLE ${table} ADD PRIMARY KEY (id, recorded_at)`);
                   console.log('   ✅ Test PK establishment succeeded.');
                } catch (addErr: any) {
                    if (addErr.message.includes('already exists') || addErr.code === '42P16') {
                        console.log('   ✅ PK already exists.');
                    } else {
                        throw addErr;
                    }
                } finally {
                   await testClient.end();
                }
            } catch (err: any) {
                console.log(`   ❌ Test PK establishment FAILED: ${err.message}`);
                console.log(`      Code: ${err.code}`);
                if (err.detail) console.log(`      Detail: ${err.detail}`);
                if (err.hint) console.log(`      Hint: ${err.hint}`);
            }
        }

        console.log('\n--- [2] Checking Migration State ---');
        try {
            const migrations = await queryClient`SELECT * FROM drizzle_migrations;`;
            console.log('   Applied Migrations Count:', migrations.length);
        } catch (err: any) {
            console.log(`   ⚠️ Could not read drizzle_migrations table. Error: ${err.message}`);
        }

        console.log('\n--- [3] Checking TimescaleDB Status ---');
        try {
            const hypertables = await queryClient`SELECT hypertable_name FROM _timescaledb_catalog.hypertable;`;
            console.log('   Hypertables:', hypertables.map((h: any) => h.hypertable_name).join(', '));
        } catch (err: any) {
            console.log(`   ⚠️ TimescaleDB metadata not accessible. Error: ${err.message}`);
        }

    } catch (err) {
        console.error('❌ Diagnostics failed:', err);
    } finally {
        await queryClient.end();
        console.log('\n✅ Diagnostics complete.');
    }
}

runDiag();
