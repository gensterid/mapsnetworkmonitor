
import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function runManualMigration() {
    try {
        console.log('Running manual migration for OLT columns...');

        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "web_port" integer DEFAULT 80;`);
        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "web_username" text;`);
        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "web_password" text;`);
        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "web_protocol" text DEFAULT 'http';`);
        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "use_snmp" boolean DEFAULT true NOT NULL;`);
        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "use_web" boolean DEFAULT false NOT NULL;`);

        console.log('Manual migration completed successfully.');
    } catch (error) {
        console.error('Error running manual migration:', error);
    }
    process.exit(0);
}

runManualMigration();
