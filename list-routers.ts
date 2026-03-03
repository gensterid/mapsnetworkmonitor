
import { db } from './apps/api/src/db/index.js';
import { routers } from './apps/api/src/db/schema/index.js';
import dotenv from 'dotenv';

dotenv.config({ path: './apps/api/.env' });

async function list() {
    const all = await db.select().from(routers);
    console.log(JSON.stringify(all, null, 2));
}

list().catch(console.error);
