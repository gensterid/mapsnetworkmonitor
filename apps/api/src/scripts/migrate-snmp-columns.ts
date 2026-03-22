import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

async function migrate() {
    logger.info('🚀 Starting SNMP column migration...');

    try {
        // 1. Add snmp_status column
        await db.execute(sql`
            ALTER TABLE routers 
            ADD COLUMN IF NOT EXISTS snmp_status TEXT DEFAULT 'unknown';
        `);
        logger.info('✅ Column "snmp_status" added.');

        // 2. Add last_snmp_error column
        await db.execute(sql`
            ALTER TABLE routers 
            ADD COLUMN IF NOT EXISTS last_snmp_error TEXT;
        `);
        logger.info('✅ Column "last_snmp_error" added.');

        logger.info('✨ Migration completed successfully!');
        process.exit(0);
    } catch (error: any) {
        logger.error({ err: error.message }, '❌ Migration failed');
        process.exit(1);
    }
}

migrate();
