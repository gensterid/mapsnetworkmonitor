import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Adding latency column to routers table...');
    try {
        await db.execute(sql`ALTER TABLE routers ADD COLUMN IF NOT EXISTS latency INTEGER DEFAULT 0`);
        console.log('Latency column added successfully!');
    } catch (e) {
        console.error('Error adding latency column:', e);
    }
    process.exit(0);
}

main();
