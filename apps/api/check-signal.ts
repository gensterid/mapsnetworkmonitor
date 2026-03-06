import { db } from './src/db/index.js';
import { devicePerformanceHistory } from './src/db/schema/performance-history.js';
import { isNotNull } from 'drizzle-orm';

async function checkSignal() {
    const res = await db.select().from(devicePerformanceHistory).where(isNotNull(devicePerformanceHistory.signal)).limit(5);
    console.log('Sample signal data:', JSON.stringify(res, null, 2));
}

checkSignal().catch(console.error);
