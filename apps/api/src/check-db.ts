import 'dotenv/config';
import { db } from './db/index.js';
import { routerNetwatch, routers } from './db/schema/index.js';

async function check() {
    const r = await db.select().from(routers);
    console.log('Routers:', r.length);

    const cw = await db.select().from(routerNetwatch);
    console.log('Netwatch Entries:', cw.length);
    process.exit(0);
}

check().catch(console.error);
