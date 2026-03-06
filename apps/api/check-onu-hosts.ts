import { db } from './src/db/index.js';
import { onus } from './src/db/schema/onus.js';
import { isNotNull, eq } from 'drizzle-orm';

async function checkOnuHosts() {
    try {
        const matchingOnu = await db.select().from(onus).where(eq(onus.host, '10.100.100.13')).limit(1);
        console.log('Matching ONU by host:', JSON.stringify(matchingOnu, null, 2));
        
        const countWithHost = await db.select().from(onus).where(isNotNull(onus.host)).limit(5);
        console.log('Sample ONUs with host:', JSON.stringify(countWithHost, null, 2));
    } catch (err) {
        console.error('Check failed:', err);
    }
}

checkOnuHosts().catch(console.error);
