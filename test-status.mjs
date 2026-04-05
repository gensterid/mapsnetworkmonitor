import { db } from './apps/api/dist/db/index.js';
import { routerNetwatch, pppoeSessions, onus, routers } from './apps/api/dist/db/schema/index.js';
import { desc, eq, sql } from 'drizzle-orm';

async function checkSync() {
    try {
        console.log('🔍 System Integrity Audit: Checking Sync Health...');

        const lastN = await db.select({ updatedAt: routerNetwatch.updatedAt }).from(routerNetwatch).orderBy(desc(routerNetwatch.updatedAt)).limit(1);
        const lastP = await db.select({ lastTrafficUpdate: pppoeSessions.lastTrafficUpdate }).from(pppoeSessions).orderBy(desc(pppoeSessions.lastTrafficUpdate)).limit(1);
        const lastOnu = await db.select({ updatedAt: onus.updatedAt }).from(onus).orderBy(desc(onus.updatedAt)).limit(1);
        const onlineCount = await db.select({ count: sql`count(*)` }).from(routers).where(eq(routers.status, 'online'));

        console.log('\n--- AUDIT RESULTS ---');
        console.log('Routers Online:', onlineCount[0].count);
        console.log('Last Netwatch Update:', lastN[0]?.updatedAt || 'N/A');
        console.log('Last PPPoE Traffic Update:', lastP[0]?.lastTrafficUpdate || 'N/A');
        console.log('Last ONU Update:', lastOnu[0]?.updatedAt || 'N/A');
        
        // Status Check for specific routers
        const rs = await db.select({ name: routers.name, status: routers.status, lastErrorMessage: routers.lastErrorMessage })
            .from(routers)
            .where(sql`${routers.name} IN ('genster', 'PUNCAK', 'YANI')`);
        
        console.log('\n--- ROUTER STATUS ---');
        rs.forEach(r => console.log(`${r.name}: ${r.status} (${r.lastErrorMessage || 'No Error'})`));

        process.exit(0);
    } catch (err) {
        console.error('Audit failed:', err);
        process.exit(1);
    }
}

checkSync();
