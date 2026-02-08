
import { db } from '../db/index.js';
import { routerNetwatch } from '../db/schema/index.js';
import { eq, ilike } from 'drizzle-orm';

async function findOdp() {
    console.log('Searching for ODP-Test-Repro...');
    const result = await db.select().from(routerNetwatch).where(ilike(routerNetwatch.name, '%ODP-Test-Repro%'));

    if (result.length > 0) {
        console.log('Found entries:', result);
    } else {
        console.log('No entries found.');
    }
    process.exit(0);
}

findOdp();
