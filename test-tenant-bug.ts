import { db } from './apps/api/src/db/index.js';
import { routerNetwatch, routers } from './apps/api/src/db/schema/index.js';
import { isNull, desc } from 'drizzle-orm';

async function main() {
    console.log("Looking for router_netwatch entries with NULL or empty tenantId...");
    
    const missing = await db.select({
        id: routerNetwatch.id,
        host: routerNetwatch.host,
        routerId: routerNetwatch.routerId,
        tenantId: routerNetwatch.tenantId
    })
    .from(routerNetwatch)
    .where(isNull(routerNetwatch.tenantId))
    .limit(10);
    
    console.log(`Found ${missing.length} missing tenantId entries in first 10 results.`);
    console.table(missing);

    // Also let's check routers table
    const missingRouters = await db.select({
        id: routers.id,
        name: routers.name,
        tenantId: routers.tenantId
    }).from(routers).where(isNull(routers.tenantId));

    console.log(`Found ${missingRouters.length} routers with missing tenantId.`);
    
    process.exit(0);
}

main().catch(console.error);
