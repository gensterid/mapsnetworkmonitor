import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function diag() {
    console.log('--- DATABASE DIAGNOSTICS ---');
    try {
        const columns = await db.execute(sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch'
            ORDER BY column_name;
        `);
        console.log('Columns in router_netwatch:');
        console.table(columns);

        const tables = await db.execute(sql`
            SELECT table_name, table_schema 
            FROM information_schema.tables 
            WHERE table_name = 'router_netwatch';
        `);
        console.log('Table locations:');
        console.table(tables);

    } catch (err) {
        console.error('DIAGNOSTIC FAILED:', err);
    }
    process.exit(0);
}

diag();
