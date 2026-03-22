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

        // 3. Add snmp_error to alert_type enum
        try {
            await db.execute(sql`ALTER TYPE alert_type ADD VALUE 'snmp_error';`);
            logger.info('✅ Enum "alert_type" updated with "snmp_error".');
        } catch (e: any) {
            // Ignore if already exists (error code 42710)
            if (e.message.includes('42710') || e.message.includes('already exists')) {
                logger.debug('ℹ️ Enum "snmp_error" already exists in "alert_type".');
            } else {
                logger.warn({ err: e.message }, '⚠️ Could not update alert_type enum (could be a non-enum type or permission issue)');
            }
        }

        logger.info('✨ Migration completed successfully!');
        process.exit(0);
    } catch (error: any) {
        logger.error({ err: error.message }, '❌ Migration failed');
        process.exit(1);
    }
}

migrate();
