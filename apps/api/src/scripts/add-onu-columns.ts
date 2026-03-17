import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Adding missing columns to onus table...');
    try {
        await db.execute(sql`ALTER TABLE onus ADD COLUMN IF NOT EXISTS pppoe_user TEXT`);
        await db.execute(sql`ALTER TABLE onus ADD COLUMN IF NOT EXISTS pppoe_pass TEXT`);
        await db.execute(sql`ALTER TABLE onus ADD COLUMN IF NOT EXISTS vlan_id INTEGER`);
        console.log('Columns added successfully.');
    } catch (error) {
        console.error('Failed to add columns:', error);
    }
    process.exit(0);
}

main();
