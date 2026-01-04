import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars FIRST
const envPath = path.resolve(process.cwd(), '.env');
console.log('Loading env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.log('Error loading .env:', result.error);
}

// Check vars
if (process.env.DATABASE_URL) {
    console.log('DATABASE_URL starts with:', process.env.DATABASE_URL.substring(0, 15) + '...');
} else {
    console.error('CRITICAL: DATABASE_URL is missing!');
    process.exit(1);
}

async function main() {
    console.log('Running manual migration to add rate columns...');
    try {
        // Dynamically import db AFTER env is loaded
        const { db } = await import('../db');
        const { sql } = await import('drizzle-orm');

        await db.execute(sql`
            ALTER TABLE "router_interfaces" 
            ADD COLUMN IF NOT EXISTS "tx_rate" bigint DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "rx_rate" bigint DEFAULT 0;
        `);
        console.log('Successfully added tx_rate and rx_rate columns');
    } catch (error) {
        console.error('Migration failed:', error);
    }
    process.exit(0);
}

main();
