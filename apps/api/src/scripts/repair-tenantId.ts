import { db } from './apps/api/src/db/index.js';
import { routerNetwatch, routers, onus } from './apps/api/src/db/schema/index.js';
import { isNull, eq, or } from 'drizzle-orm';

async function main() {
    console.log("Starting script to repair empty tenantIds...");
    
    // 1. Repair Router Netwatch
    const netwatchWithoutTenant = await db.select()
        .from(routerNetwatch)
        .where(
            or(
                isNull(routerNetwatch.tenantId),
                eq(routerNetwatch.tenantId, '')
            )
        );
        
    console.log(`Found ${netwatchWithoutTenant.length} router_netwatch entries missing tenantId.`);
    
    let nwRepaired = 0;
    for (const nw of netwatchWithoutTenant) {
        // Find parent router to inherit tenantId
        const [parentRouter] = await db.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, nw.routerId));
        if (parentRouter?.tenantId) {
            await db.update(routerNetwatch).set({ tenantId: parentRouter.tenantId }).where(eq(routerNetwatch.id, nw.id));
            nwRepaired++;
        }
    }
    console.log(`Repaired ${nwRepaired} router_netwatch entries.`);
    
    // 2. Repair ONUs
    const onusWithoutTenant = await db.select()
        .from(onus)
        .where(
            or(
                isNull(onus.tenantId),
                eq(onus.tenantId, '')
            )
        );
        
    console.log(`Found ${onusWithoutTenant.length} onus entries missing tenantId.`);
    
    let onusRepaired = 0;
    for (const o of onusWithoutTenant) {
        const [parentRouter] = await db.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, o.routerId!));
        if (parentRouter?.tenantId) {
            await db.update(onus).set({ tenantId: parentRouter.tenantId }).where(eq(onus.id, o.id));
            onusRepaired++;
        }
    }
    console.log(`Repaired ${onusRepaired} onus entries.`);
    
    console.log("Repair finished successfully.");
    process.exit(0);
}

main().catch(console.error);
