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
        console.log("Router found:");
        console.log(`- ID: ${router.id}`);
        console.log(`- Name: ${router.name}`);
        console.log(`- Host: ${router.host}`);
        console.log(`- TenantID: ${router.tenantId}`);
    }

    // Also check if there are any tenants in the system
    const allTenants = await db.query.tenants.findMany();
    console.log(`\nSystem has ${allTenants.length} tenants:`);
    allTenants.forEach(t => console.log(`- ${t.id}: ${t.name}`));

    process.exit(0);
}

main().catch(console.error);
