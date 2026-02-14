
import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function runManualMigration() {
    try {
        console.log('Running manual migration for OLT active_protocol...');

        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "active_protocol" text;`);

        console.log('Manual migration completed successfully.');
    } catch (error) {
        console.error('Error running manual migration:', error);
    }
    process.exit(0);
}

runManualMigration();
