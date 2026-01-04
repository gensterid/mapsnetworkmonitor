import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Adding timezone column to users table...');

    try {
        await db.execute(sql`
            ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'Asia/Jakarta' NOT NULL;
        `);
        console.log('Successfully added timezone column.');
    } catch (error) {
        console.error('Error adding column:', error);
    }
    process.exit(0);
}

main();
