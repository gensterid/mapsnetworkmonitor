import { db } from './db/index.js';
import { routers } from './db/schema/index.js';

async function main() {
    const allRouters = await db.select().from(routers);
    console.table(allRouters.map(r => ({
        id: r.id,
        name: r.name,
        host: r.host,
        status: r.status
    })));
}

main();
