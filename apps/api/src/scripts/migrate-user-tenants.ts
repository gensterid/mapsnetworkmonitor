import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

async function main() {
    try {
        logger.info('Starting user_tenants table creation...');
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_tenants (
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, tenant_id)
            )
        `);
        logger.info('✅ table user_tenants created or already exists');
        process.exit(0);
    } catch (e) {
        logger.error({ err: e }, '❌ Failed to create table');
        process.exit(1);
    }
}

main();
