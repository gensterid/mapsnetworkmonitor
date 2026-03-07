import { db } from './apps/api/src/db/index.js';
import { devicePerformanceHistory } from './apps/api/src/db/schema/index.js';
import { desc } from 'drizzle-orm';

async function main() {
    console.log("Current system time:", new Date().toISOString());
    const latest = await db.select()
        .from(devicePerformanceHistory)
        .orderBy(desc(devicePerformanceHistory.recordedAt))
        .limit(5);
    console.log("Latest history entries:");
    console.dir(latest, { depth: null });
    process.exit(0);
}

main().catch(console.error);
