import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL!;
const queryClient = postgres(connectionString, { max: 1 });
const db = drizzle(queryClient);

async function apply() {
    console.log('--- APPLYING UNIQUE INDEX MANUALLY ---');
    try {
        // 1. Check if index already exists
        const checkRes = await db.execute(sql`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'router_netwatch' 
            AND indexname = 'router_netwatch_router_host_unique_idx'
        `);

        if (checkRes.length > 0) {
            console.log('Unique index already exists in database.');
        } else {
            console.log('Index not found. Attempting to create router_netwatch_router_host_unique_idx...');
            await db.execute(sql`
                CREATE UNIQUE INDEX router_netwatch_router_host_unique_idx 
                ON router_netwatch (router_id, host)
            `);
            console.log('Successfully created unique index.');
        }

        process.exit(0);
    } catch (err: any) {
        console.error('Failed to apply unique index:', err.message || err);
        if (err.message && err.message.includes('duplicate key value')) {
            console.error('ERROR: Database still contains duplicates! Please run cleanup script first.');
        }
        process.exit(1);
    }
}

apply();
