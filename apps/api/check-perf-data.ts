import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function checkData() {
    try {
        const countRes = await db.execute(sql`SELECT count(*) FROM device_performance_history`);
        console.log('Total rows in device_performance_history:', countRes[0]?.count);

        if (parseInt(countRes[0]?.count as string) > 0) {
            const samples = await db.execute(sql`SELECT * FROM device_performance_history LIMIT 5`);
            console.log('Sample rows:');
            console.log(JSON.stringify(samples, null, 2));

            const hosts = await db.execute(sql`SELECT DISTINCT host FROM device_performance_history`);
            console.log('Distinct hosts:', JSON.stringify(hosts, null, 2));
        }

        // Also check if any recording error occurred in logs (if reachable)
    } catch (err) {
        console.error('Error checking data:', err);
    } finally {
        process.exit(0);
    }
}

checkData();
