import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

async function addLatencyColumn() {
    try {
        console.log('Adding latency column to tables...');

        // Add latency column to routers table if it doesn't exist
        console.log('1. Adding latency to routers table...');
        await db.execute(sql`
      ALTER TABLE routers 
      ADD COLUMN IF NOT EXISTS latency integer
    `);
        console.log('   ✅ Done');

        // Add latency column to router_netwatch table if it doesn't exist
        console.log('2. Adding latency to router_netwatch table...');
        await db.execute(sql`
      ALTER TABLE router_netwatch 
      ADD COLUMN IF NOT EXISTS latency integer
    `);
        console.log('   ✅ Done');

        console.log('\n✅ All latency columns added successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding latency column:', error);
        process.exit(1);
    }
}

addLatencyColumn();
