import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function checkNetwatch() {
    try {
        const routerId = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3';
        const res = await db.execute(sql`SELECT * FROM router_netwatch WHERE router_id = ${routerId}`);
        console.log(`Netwatch entries for router ${routerId}:`, res.length);
        if (res.length > 0) {
            console.log('Sample entries (first 2):');
            console.log(JSON.stringify(res.slice(0, 2), null, 2));
        } else {
            console.log('No netwatch entries found for this router.');
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkNetwatch();
