import { db } from './apps/api/src/db/index.js';
import { olts } from './apps/api/src/db/schema/olts.js';

async function listOlts() {
    const allOlts = await db.select().from(olts);
    console.log(JSON.stringify(allOlts.map(o => ({ id: o.id, name: o.name, host: o.host })), null, 2));
}

listOlts().catch(console.error);
