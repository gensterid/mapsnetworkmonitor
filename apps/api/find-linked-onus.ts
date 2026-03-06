import { db } from './src/db/index.js';
import { routerNetwatch } from './src/db/schema/routers.js';
import { onus } from './src/db/schema/onus.js';
import { isNotNull, eq } from 'drizzle-orm';

async function findLinked() {
    try {
        const res = await db.select({
            deviceName: routerNetwatch.name,
            host: routerNetwatch.host,
            linkedOnuId: routerNetwatch.linkedOnuId,
        })
        .from(routerNetwatch)
        .where(isNotNull(routerNetwatch.linkedOnuId))
        .limit(10);
        
        console.log('Linked devices found:', res.length);
        console.log(JSON.stringify(res, null, 2));
        
        if (res.length > 0) {
            const firstOnuId = res[0].linkedOnuId;
            const onuData = await db.select().from(onus).where(eq(onus.id, firstOnuId)).limit(1);
            console.log('ONU Data for first linked device:', JSON.stringify(onuData, null, 2));
        }
    } catch (err) {
        console.error('Search failed:', err);
    }
}

findLinked().catch(console.error);
