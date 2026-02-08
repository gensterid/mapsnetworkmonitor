
import { db } from '../db/index.js';
import { routerNetwatch } from '../db/schema/index.js';
import { eq, ilike } from 'drizzle-orm';

async function removeOdp() {
    console.log('Removing ODP-Test-Repro...');
    const result = await db.delete(routerNetwatch).where(ilike(routerNetwatch.name, '%ODP-Test-Repro%')).returning();

    if (result.length > 0) {
        console.log('Removed entries:', result);
    } else {
        console.log('No entries found to remove.');
    }
    process.exit(0);
}

removeOdp();
