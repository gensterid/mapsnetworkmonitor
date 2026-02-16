import { db } from './apps/api/src/db/index.js';
import { olts } from './apps/api/src/db/schema/olts.js';
import { eq } from 'drizzle-orm';

async function findOltId() {
    // @ts-ignore
    const result = await db.select().from(olts).where(eq(olts.name, 'Cdata01'));
    if (result.length > 0) {
        console.log(`ID: ${result[0].id}`);
    } else {
        console.log('OLT not found');
    }
}

findOltId().catch(console.error);
