import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';
import { devicePerformanceHistory } from './src/db/schema/index.js';

async function test() {
    try {
        const timeSelect = sql`to_timestamp(floor(extract('epoch' from ${devicePerformanceHistory.recordedAt}) / 10800) * 10800)`;
        const res = await db.select({
            timestamp: timeSelect.as('timestamp')
        }).from(devicePerformanceHistory).limit(1);
        console.log('Test 3 hours:', res);

        const timeSelect2 = sql`DATE_TRUNC('hour', ${devicePerformanceHistory.recordedAt})`;
        const res2 = await db.select({
            timestamp: timeSelect2.as('timestamp')
        }).from(devicePerformanceHistory).limit(1);
        console.log('Test 1 hour:', res2);
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
test();
