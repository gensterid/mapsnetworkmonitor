
import { db } from '../db/index.js';
import { routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

async function listRouters() {
    const allRouters = await db.select().from(routers);
    console.log(JSON.stringify(allRouters.map(r => ({
        id: r.id,
        name: r.name,
        useGenieAcs: r.useGenieAcs,
        genieacsUrl: r.genieacsUrl,
        genieacsUsername: r.genieacsUsername
    })), null, 2));
    process.exit(0);
}

listRouters();
