import { db } from '../db/index.js';
import { routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

async function main() {
    const routerId = 'c7f88705-f35c-478c-bf8d-2ffd16e8a831';
    const router = await db.query.routers.findFirst({
        where: eq(routers.id, routerId)
    });

    if (!router) {
        console.log("Router not found");
    } else {
        console.log("Router Config:");
        console.log(`- Host: ${router.host}`);
        console.log(`- Port: ${router.port}`);
        console.log(`- Identity: ${router.identity}`);
        console.log(`- Status: ${router.status}`);
    }
    process.exit(0);
}

main().catch(console.error);
