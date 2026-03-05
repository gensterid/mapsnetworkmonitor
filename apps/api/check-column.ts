import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function check() {
    try {
        const result = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch' 
            AND column_name = 'disabled';
        `);
        console.log('Column check result:', result);
        process.exit(0);
    } catch (err) {
        console.error('Error checking column:', err);
        process.exit(1);
    }
}

check();
