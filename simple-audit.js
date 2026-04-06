const { db } = require('./apps/api/dist/db/index.js');
const { routerNetwatch, pppoeSessions } = require('./apps/api/dist/db/schema/index.js');
const { desc } = require('drizzle-orm');

async function checkSync() {
    try {
        const lastN = await db.select({ updatedAt: routerNetwatch.updatedAt }).from(routerNetwatch).orderBy(desc(routerNetwatch.updatedAt)).limit(1);
        const lastP = await db.select({ updatedAt: pppoeSessions.lastSeen }).from(pppoeSessions).orderBy(desc(pppoeSessions.lastSeen)).limit(1);
        
        console.log('--- SYNC AUDIT RESULT ---');
        console.log('Last Netwatch Sync:', lastN[0]?.updatedAt);
        console.log('Last PPPoE Sync:', lastP[0]?.updatedAt);
        process.exit(0);
    } catch (err) {
        console.error('Audit failed:', err.message);
        process.exit(1);
    }
}

checkSync();
