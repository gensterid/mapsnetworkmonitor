console.log('--- DIAGNOSTIC SCRIPT START ---');
import { db } from './apps/api/src/db/index.js';
import { routerNetwatch, onus, olts } from './apps/api/src/db/schema/index.js';
import { eq, sql } from 'drizzle-orm';

async function checkHost(host: string) {
    console.log(`--- Checking Host: ${host} ---`);

    const nwEntries = await db.select().from(routerNetwatch).where(eq(routerNetwatch.host, host));
    console.log('Netwatch Entries:', JSON.stringify(nwEntries, null, 2));

    const onuEntries = await db.select().from(onus).where(eq(onus.host, host));
    console.log('ONU Entries:', JSON.stringify(onuEntries, null, 2));

    if (nwEntries.length > 0 && onuEntries.length > 0) {
        const nw = nwEntries[0];
        const routerId = nw.routerId;

        console.log(`\nValidating Join Conditions for Router ID: ${routerId}`);

        const relatedOlts = await db.select().from(olts).where(eq(olts.parentId, routerId));
        console.log('Related OLT IDs:', relatedOlts.map(o => o.id));

        for (const onu of onuEntries) {
            console.log(`ONU SN: ${onu.sn}, OLT ID: ${onu.oltId}`);
            const isOltMatch = relatedOlts.some(o => o.id === onu.oltId);
            console.log(`OLT Match: ${isOltMatch}`);
        }
    }
}

checkHost('10.100.100.12')
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
