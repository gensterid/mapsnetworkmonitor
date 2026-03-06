import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function testQuery() {
    try {
        console.log('Testing problematic query...');
        const query = sql`
            select DATE_TRUNC('hour', "recorded_at") as "timestamp", avg("latency"), avg("signal") 
            from "device_performance_history" 
            where ("device_performance_history"."recorded_at" >= ${new Date('2026-02-27T14:06:47.106Z')} 
            and "device_performance_history"."recorded_at" <= ${new Date('2026-03-06T14:06:47.106Z')} 
            and "device_performance_history"."router_id" = ${'d9328185-2fb1-49cb-a51f-3ec7449d5ad3'} 
            and "device_performance_history"."host" = ${'10.100.100.13'}) 
            group by DATE_TRUNC('hour', "device_performance_history"."recorded_at") 
            order by DATE_TRUNC('hour', "device_performance_history"."recorded_at")
        `;
        const res = await db.execute(query);
        console.log('Query result:', JSON.stringify(res, null, 2));
    } catch (err) {
        console.error('SQL Execution Failed:');
        console.error(err);
    } finally {
        process.exit(0);
    }
}

testQuery();
