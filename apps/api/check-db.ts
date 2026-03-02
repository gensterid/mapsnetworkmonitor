import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function check() {
    try {
        const result = await db.execute(sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'topology_links' AND column_name = 'path_offset'
        `);
        console.log('Column check result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        process.exit(0);
    }
}

check();
