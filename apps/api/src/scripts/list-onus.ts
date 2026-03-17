import { db } from '../db/index.js';
import { onus } from '../db/schema/onus.js';

async function main() {
    console.log('Fetching first 5 ONUs to check SN format...');
    try {
        const records = await db.select().from(onus).limit(5);
        console.log(JSON.stringify(records, null, 2));
    } catch (error) {
        console.error('Query failed:', error);
    }
    process.exit(0);
}

main();
