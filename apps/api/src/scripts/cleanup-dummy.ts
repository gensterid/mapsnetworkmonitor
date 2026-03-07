import 'dotenv/config';
import { db } from '../db/index.js';
import { routers, olts, onus, routerNetwatch, pppoeSessions } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

async function cleanupDummy() {
    logger.info('🧹 Starting cleanup of dummy data from database...');

    try {
        // 1. Delete ONUs with dummy Serial Numbers
        const onusResult = await db.delete(onus).where(sql`sn LIKE 'DMY-%'`);
        logger.info('✅ Deleted dummy ONUs');

        // 2. Delete Netwatch entries with MOCK in name
        const netwatchResult = await db.delete(routerNetwatch).where(sql`name LIKE '%MOCK%'`);
        logger.info('✅ Deleted dummy Netwatch entries');

        // 3. Delete PPPoE sessions with user- prefix
        const pppoeResult = await db.delete(pppoeSessions).where(sql`name LIKE 'user-%'`);
        logger.info('✅ Deleted dummy PPPoE sessions');

        // 4. Delete OLTs with MOCK in name
        const oltsResult = await db.delete(olts).where(sql`name LIKE 'OLT-%-MOCK'`);
        logger.info('✅ Deleted dummy OLTs');

        // 5. Delete specific DUMMY-CORE-ROUTER
        const routersResult = await db.delete(routers).where(eq(routers.name, 'DUMMY-CORE-ROUTER'));
        logger.info('✅ Deleted dummy Router (DUMMY-CORE-ROUTER)');

        logger.info('🎉 Database cleanup complete!');
        process.exit(0);
    } catch (err) {
        logger.error({ err }, '❌ Failed to cleanup dummy data');
        process.exit(1);
    }
}

cleanupDummy();
