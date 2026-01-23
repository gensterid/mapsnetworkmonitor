import { config } from 'dotenv';
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

// Robust env loading
const loadEnv = () => {
    // Try apps/api/.env
    let envPath = path.resolve(process.cwd(), '.env');
    config({ path: envPath });
    if (process.env.DATABASE_URL) return;

    // Try root .env
    envPath = path.resolve(process.cwd(), '../../.env');
    config({ path: envPath });
    if (process.env.DATABASE_URL) return;

    // Try default location for monorepo
    envPath = path.resolve(__dirname, '../../../../.env');
    config({ path: envPath });
};

loadEnv();

if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL not found in .env files.');
    console.error('Please ensure you have a .env file in the root or apps/api directory.');
    process.exit(1);
}

const runRepair = async () => {
    console.log('🔧 Starting Database Repair...');
    console.log(`📡 Connecting to database...`);

    try {
        const queryClient = postgres(process.env.DATABASE_URL!);
        const db = drizzle(queryClient);

        // 1. Fix: last_known_latency column in router_netwatch
        console.log('🔍 Checking router_netwatch table...');
        const checkColumn = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='router_netwatch' AND column_name='last_known_latency';
        `);

        if (checkColumn.length === 0) {
            console.log('⚠️ Column last_known_latency missing. Adding it now...');
            await db.execute(sql`ALTER TABLE router_netwatch ADD COLUMN last_known_latency integer;`);
            console.log('✅ Column last_known_latency added successfully.');
        } else {
            console.log('✅ Column last_known_latency already exists.');
        }

        // 2. Fix: pppoe_sessions columns
        console.log('🔍 Checking pppoe_sessions table...');

        // Status column
        const checkStatus = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='pppoe_sessions' AND column_name='status';
        `);
        if (checkStatus.length === 0) {
            console.log('⚠️ Column status missing in pppoe_sessions. Adding it...');
            await db.execute(sql`ALTER TABLE pppoe_sessions ADD COLUMN status text DEFAULT 'active';`);
            console.log('✅ Column status added.');
        }

        // Last Down column
        const checkLastDown = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='pppoe_sessions' AND column_name='last_down';
        `);
        if (checkLastDown.length === 0) {
            console.log('⚠️ Column last_down missing in pppoe_sessions. Adding it...');
            await db.execute(sql`ALTER TABLE pppoe_sessions ADD COLUMN last_down timestamp;`);
            console.log('✅ Column last_down added.');
        }

        // Last Latency column
        const checkLastLatency = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='pppoe_sessions' AND column_name='last_latency';
        `);
        if (checkLastLatency.length === 0) {
            console.log('⚠️ Column last_latency missing in pppoe_sessions. Adding it...');
            await db.execute(sql`ALTER TABLE pppoe_sessions ADD COLUMN last_latency integer;`);
            console.log('✅ Column last_latency added.');
        }

        // Add other repairs here if needed in future

        console.log('🎉 Database repair completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Repair failed:', err);
        process.exit(1);
    }
};

runRepair();
