import { db } from './src/db/index.js';
import { count } from 'drizzle-orm';
import { routers, routerNetwatch, pppoeSessions } from './src/db/schema/index.js';

async function checkCounts() {
    try {
        const routerCount = await db.select({ val: count() }).from(routers);
        const netwatchCount = await db.select({ val: count() }).from(routerNetwatch);
        const pppoeCount = await db.select({ val: count() }).from(pppoeSessions);
        console.log(`TOTAL_ROUTERS: ${routerCount[0].val}`);
        console.log(`TOTAL_NETWATCH: ${netwatchCount[0].val}`);
        console.log(`TOTAL_PPPOE: ${pppoeCount[0].val}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkCounts();
