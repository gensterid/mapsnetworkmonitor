import { db } from './src/db/index.js';
import { routerNetwatch } from './src/db/schema/routers.js';
import { eq } from 'drizzle-orm';

async function findLink() {
    try {
        const res = await db.select().from(routerNetwatch).where(eq(routerNetwatch.host, '10.100.100.13')).limit(1);
        console.log('Device info:', JSON.stringify(res, null, 2));
    } catch (err) {
        console.error('Query failed:', err);
    }
}

findLink().catch(console.error);
