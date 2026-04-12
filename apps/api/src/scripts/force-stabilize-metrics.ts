
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

async function forceStabilize() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    console.log('📡 Connecting to database for emergency restoration...');
    // Use a single connection for raw SQL execution
    const queryClient = postgres(connectionString);
    const db = drizzle(queryClient);

    const tsTables = ['device_performance_history', 'router_metrics', 'router_interface_metrics'];

    try {
        for (const table of tsTables) {
            console.log(`\n🚀 Processing TABLE: ${table}...`);

            // Step 1: Aggressive cleanup of ALL Primary Key constraints on parent AND chunks
            console.log(`   🛠️ Removing all existing Primary Key constraints...`);
            await db.execute(sql.raw(`
                DO $$ 
                DECLARE 
                    r RECORD;
                BEGIN 
                    -- Drop from chunks first (TimescaleDB internal)
                    FOR r IN (
                        SELECT con.conrelid::regclass::text as chunk_table, con.conname 
                        FROM pg_constraint con 
                        JOIN pg_class rel ON rel.oid = con.conrelid 
                        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                        WHERE (rel.relname LIKE '_hyper_%' OR rel.relname = '${table}')
                        AND con.contype = 'p'
                        AND (
                            rel.relname = '${table}' 
                            OR EXISTS (
                                SELECT 1 FROM _timescaledb_catalog.chunk c
                                JOIN _timescaledb_catalog.hypertable h ON h.id = c.hypertable_id
                                WHERE h.table_name = '${table}' 
                                AND c.table_name = rel.relname
                            )
                        )
                    ) LOOP
                        BEGIN
                            EXECUTE 'ALTER TABLE ' || r.chunk_table || ' DROP CONSTRAINT ' || quote_ident(r.conname);
                            RAISE NOTICE 'Dropped PK % from %', r.conname, r.chunk_table;
                        EXCEPTION WHEN OTHERS THEN
                            RAISE NOTICE 'Could not drop PK % from %: %', r.conname, r.chunk_table, SQLERRM;
                        END;
                    END LOOP;
                END $$;
            `));

            // Step 2: Ensure recorded_at is NOT NULL
            console.log(`   📌 Ensuring recorded_at is NOT NULL...`);
            await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN recorded_at SET NOT NULL;`));

            // Step 3: Add the correct composite Primary Key
            console.log(`   🔑 Adding corrected Primary Key (id, recorded_at)...`);
            try {
                await db.execute(sql.raw(`ALTER TABLE ${table} ADD PRIMARY KEY (id, recorded_at);`));
                console.log(`   ✅ Primary Key established for ${table}`);
            } catch (pkErr: any) {
                console.error(`   ❌ FAILED to add Primary Key for ${table}: ${pkErr.message}`);
                if (pkErr.detail) console.error(`      Detail: ${pkErr.detail}`);
            }

            // Step 4: Verify hypertable status
            await db.execute(sql.raw(`SELECT create_hypertable('${table}', 'recorded_at', if_not_exists => TRUE, migrate_data => TRUE);`)).catch(() => {});
        }

        console.log('\n🎉 Emergency restoration completed!');
    } catch (err) {
        console.error('\n❌ Emergency restoration failed:', err);
    } finally {
        await queryClient.end();
    }
}

forceStabilize();
