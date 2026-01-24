import { config } from 'dotenv';
import path from 'path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Ensure we are in ES module environment or handle appropriately
// We will simply execute this with tsx which handles ESM

async function run() {
    // Try to load .env from project root (../../.env from apps/api)
    // We assume CWD is apps/api
    let envPath = path.resolve(process.cwd(), '../../.env');
    config({ path: envPath });

    if (!process.env.DATABASE_URL) {
        // Try current dir if failed
        envPath = path.resolve(process.cwd(), '.env');
        config({ path: envPath });
    }

    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL not found. CWD:', process.cwd());
        process.exit(1);
    }

    console.log('Connecting to DB...');
    const queryClient = postgres(process.env.DATABASE_URL);
    const db = drizzle(queryClient);

    console.log('Checking router_netwatch table for last_known_latency...');
    try {
        // Check if column exists
        const result = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='router_netwatch' AND column_name='last_known_latency';
        `);

        if (result.length === 0) {
            console.log('Adding last_known_latency column...');
            await db.execute(sql`alter table router_netwatch add column last_known_latency integer;`);
            console.log('Column added successfully.');
        } else {
            console.log('Column already exists.');
        }

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
