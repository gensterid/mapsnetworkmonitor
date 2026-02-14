import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function checkColumns() {
    try {
        const res = await db.execute(sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'routers'
            ORDER BY column_name;
        `);
        console.log('Columns in "routers" table:');
        console.table(res);
        process.exit(0);
    } catch (err) {
        console.error('Error checking columns:', err);
        process.exit(1);
    }
}

checkColumns();
