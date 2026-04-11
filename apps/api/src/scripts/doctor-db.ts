import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

async function runDoctor() {
    console.log('🩺 Starting Database Diagnosis (Doctor)...');
    
    try {
        // 1. Check Hypertables
        console.log('\n--- 🧊 Hypertables (Public Info) ---');
        try {
            const hypertables = await db.execute(sql.raw(`
                SELECT id, hypertable_schema, hypertable_name FROM timescaledb_information.hypertables;
            `));
            console.table(hypertables);
        } catch (e: any) {
            console.log('⚠️ timescaledb_information.hypertables not available:', e.message);
        }

        // 2. Check internal catalog
        console.log('\n--- 📂 Internal Catalog (_timescaledb_catalog.hypertable) ---');
        try {
            const internal = await db.execute(sql.raw(`
                SELECT id, schema_name, table_name FROM _timescaledb_catalog.hypertable;
            `));
            console.table(internal);
        } catch (e: any) {
            console.log('⚠️ _timescaledb_catalog.hypertable not available:', e.message);
        }

        // 3. Confirm onus table status
        console.log('\n--- 🔍 Checking "onus" table directly ---');
        const onusStatus = await db.execute(sql.raw(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_name = 'onus';
        `));
        console.log('Table existence in information_schema:', JSON.stringify(onusStatus));

        // 4. Check for constraints on onus
        console.log('\n--- 🔗 Foreign Keys/Constraints on "onus" ---');
        const constraints = await db.execute(sql.raw(`
            SELECT conname, contype 
            FROM pg_constraint 
            WHERE conrelid = 'onus'::regclass;
        `));
        console.table(constraints);

        // 5. Identify the mysterious _hyper_2
        console.log('\n--- 🕵️ Investigating ID 2 ---');
        try {
            const h2 = await db.execute(sql.raw(`
                SELECT * FROM _timescaledb_catalog.hypertable WHERE id = 2;
            `));
            console.log('Hypertable ID 2 corresponds to:', JSON.stringify(h2));
        } catch (e) {}

    } catch (err: any) {
        console.error('💥 Doctor failed:', err.message);
    } finally {
        console.log('\n🩺 Diagnosis complete.');
        process.exit(0);
    }
}

runDoctor();
