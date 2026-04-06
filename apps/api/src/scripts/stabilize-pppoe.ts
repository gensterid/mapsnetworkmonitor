import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL!;
const queryClient = postgres(connectionString, { max: 1 });
const db = drizzle(queryClient);

async function stabilize() {
    console.log('--- STARTING PPPOE STABILIZATION ---');
    try {
        // 1. Audit & Cleanup Duplicates
        console.log('Auditing PPPoE sessions for duplicates...');
        const dupCount = await db.execute(sql`
            SELECT router_id, name, COUNT(*) as cnt 
            FROM pppoe_sessions 
            GROUP BY router_id, name 
            HAVING COUNT(*) > 1
        `);

        console.log(`Found ${dupCount.length} sets of duplicates.`);

        if (dupCount.length > 0) {
            console.log('Cleaning up redundant PPPoE sessions...');
            await db.execute(sql`
                DELETE FROM pppoe_sessions 
                WHERE id IN (
                    SELECT id 
                    FROM (
                        SELECT id, ROW_NUMBER() OVER(
                            PARTITION BY router_id, name 
                            ORDER BY last_seen DESC, connected_at DESC, id DESC
                        ) as rn 
                        FROM pppoe_sessions
                    ) t 
                    WHERE t.rn > 1
                )
            `);
            console.log('Redundant rows deleted.');
        }

        // 2. Add Unique Index
        console.log('Checking for unique index...');
        const indexCheck = await db.execute(sql`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'pppoe_sessions' 
            AND indexname = 'pppoe_sessions_router_name_unique_idx'
        `);

        if (indexCheck.length === 0) {
            console.log('Adding unique index on (router_id, name)...');
            await db.execute(sql`
                CREATE UNIQUE INDEX pppoe_sessions_router_name_unique_idx 
                ON pppoe_sessions (router_id, name)
            `);
            console.log('Unique index created successfully.');
        } else {
            console.log('Unique index already exists.');
        }

        console.log('--- PPPOE STABILIZATION COMPLETE ---');
        process.exit(0);
    } catch (err: any) {
        console.error('Stabilization failed:', err.message);
        process.exit(1);
    }
}

stabilize();
