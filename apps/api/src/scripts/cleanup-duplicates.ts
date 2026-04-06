import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

const connectionString = process.env.DATABASE_URL!;
const queryClient = postgres(connectionString, { max: 1 });
const db = drizzle(queryClient);

async function cleanup() {
    console.log('--- STARTING DUPLICATE CLEANUP ---');
    try {
        // 1. Count duplicates before cleanup
        const countRes = await db.execute(sql`
            SELECT router_id, host, COUNT(*) as cnt 
            FROM router_netwatch 
            GROUP BY router_id, host 
            HAVING COUNT(*) > 1
        `);
        
        console.log(`Found ${countRes.length} sets of duplicates.`);
        
        if (countRes.length === 0) {
            console.log('No duplicates found. Database is clean.');
            process.exit(0);
        }

        const totalToCleanup = countRes.reduce((acc, curr) => acc + (Number(curr.cnt) - 1), 0);
        console.log(`Total redundant rows to delete: ${totalToCleanup}`);

        // 2. Perform deletion keeping the newest record
        console.log('Deleting redundant rows...');
        const deleteRes = await db.execute(sql`
            DELETE FROM router_netwatch 
            WHERE id IN (
                SELECT id 
                FROM (
                    SELECT id, ROW_NUMBER() OVER(
                        PARTITION BY router_id, host 
                        ORDER BY updated_at DESC, id DESC
                    ) as rn 
                    FROM router_netwatch
                ) t 
                WHERE t.rn > 1
            )
        `);

        console.log(`Successfully deleted redundant rows.`);
        
        // 3. Verify
        const verifyRes = await db.execute(sql`
            SELECT COUNT(*) FROM (
                SELECT router_id, host FROM router_netwatch GROUP BY router_id, host HAVING COUNT(*) > 1
            ) t
        `);
        
        if (Number(verifyRes[0].count) === 0) {
            console.log('Verification PASSED: All duplicates removed.');
        } else {
            console.warn('Verification FAILED: Some duplicates still exist.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Cleanup failed:', err);
        process.exit(1);
    }
}

cleanup();
