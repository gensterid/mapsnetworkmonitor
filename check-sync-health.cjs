import { db } from './apps/api/src/db/index.js';
import { routers, routerNetwatch, pppoeSessions, onus } from './apps/api/src/db/schema/index.js';
import { desc, sql, eq } from 'drizzle-orm';

async function checkSyncHealth() {
    console.log('🔍 System Integrity Audit: Checking Sync Health Across Sub-systems...');

    // 1. Check Netwatch
    const lastNetwatch = await db.select({ 
        updatedAt: routerNetwatch.updatedAt,
        routerId: routerNetwatch.routerId,
        host: routerNetwatch.host
    }).from(routerNetwatch).orderBy(desc(routerNetwatch.updatedAt)).limit(3);
    
    console.log('\n--- Netwatch Table ---');
    if (lastNetwatch.length > 0) {
        lastNetwatch.forEach(n => console.log(`Host ${n.host} updated at: ${n.updatedAt}`));
    } else {
        console.log('⚠️ No Netwatch entries found.');
    }

    // 2. Check PPPoE
    const lastPppoe = await db.select({
        updatedAt: pppoeSessions.updatedAt,
        username: pppoeSessions.username
    }).from(pppoeSessions).orderBy(desc(pppoeSessions.updatedAt)).limit(3);
    
    console.log('\n--- PPPoE Sessions Table ---');
    if (lastPppoe.length > 0) {
        lastPppoe.forEach(p => console.log(`Session ${p.username} updated at: ${p.updatedAt}`));
    } else {
        console.log('⚠️ No PPPoE sessions found.');
    }

    // 3. Check ONUs
    const lastOnu = await db.select({
        updatedAt: onus.updatedAt,
        onuIndex: onus.onuIndex
    }).from(onus).orderBy(desc(onus.updatedAt)).limit(3);
    
    console.log('\n--- ONUs Table ---');
    if (lastOnu.length > 0) {
        lastOnu.forEach(o => console.log(`ONU ${o.onuIndex} updated at: ${o.updatedAt}`));
    } else {
        console.log('⚠️ No ONU entries found.');
    }

    // 4. Persistence Test Result
    const stats = await db.select({
        count: sql<number>`count(*)`
    }).from(routers).where(eq(routers.status, 'online'));
    
    console.log(`\n--- Persistence ---`);
    console.log(`Currently Online: ${stats[0].count} routers.`);
}

checkSyncHealth().catch(console.error);
