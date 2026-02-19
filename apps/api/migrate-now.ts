import 'dotenv/config';
import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Starting manual migration...');
    try {
        await db.execute(sql`ALTER TABLE onus ADD COLUMN IF NOT EXISTS mac_address TEXT`);
        console.log('✅ Column mac_address added or already exists');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

main();
