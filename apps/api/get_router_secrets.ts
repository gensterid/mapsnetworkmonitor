
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';

async function main() {
    const allRouters = await db.select({
        id: routers.id,
        name: routers.name,
        webhookSecret: routers.webhookSecret,
        routerOsVersion: routers.routerOsVersion,
        model: routers.model
    }).from(routers);
    
    console.log(JSON.stringify(allRouters, null, 2));
    process.exit(0);
}

main().catch(console.error);
