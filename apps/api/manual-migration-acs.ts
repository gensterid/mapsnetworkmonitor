
import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Running manual migration for ACS metadata...');

    try {
        // Add columns
        console.log('Adding model column...');
        await db.execute(sql`ALTER TABLE onus ADD COLUMN IF NOT EXISTS model text;`);

        console.log('Adding ssid column...');
        await db.execute(sql`ALTER TABLE onus ADD COLUMN IF NOT EXISTS ssid text;`);

        console.log('Adding firmware_version column...');
        await db.execute(sql`ALTER TABLE onus ADD COLUMN IF NOT EXISTS firmware_version text;`);

        // Make olt_id optional
        console.log('Altering olt_id to be nullable...');
        await db.execute(sql`ALTER TABLE onus ALTER COLUMN olt_id DROP NOT NULL;`);

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    }
    process.exit(0);
}

main();
