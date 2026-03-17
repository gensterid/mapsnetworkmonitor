import { db } from '../db/index.js';
import { onus } from '../db/schema/onus.js';
import { eq } from 'drizzle-orm';

async function main() {
    const sn = 'FHTT9C70DAF0';
    console.log(`Checking for ONU with SN: ${sn}...`);
    try {
        const [record] = await db.select().from(onus).where(eq(onus.sn, sn)).limit(1);
        if (record) {
            console.log('Record found:', JSON.stringify(record, null, 2));
        } else {
            console.log('Record NOT found.');
        }
    } catch (error) {
        console.error('Query failed:', error);
    }
    process.exit(0);
}

main();
