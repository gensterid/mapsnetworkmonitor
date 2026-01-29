
import 'dotenv/config';
import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

async function main() {
    console.log('Checking for unresolved Threshold alerts...');

    const unresolved = await db.select()
        .from(alerts)
        .where(
            and(
                eq(alerts.type, 'threshold'),
                eq(alerts.resolved, false)
            )
        )
        .orderBy(alerts.createdAt);

    console.log(`Found ${unresolved.length} unresolved threshold alerts.`);

    unresolved.forEach(a => {
        console.log(`[${a.createdAt}] ID:${a.id} Title: "${a.title}" Message: "${a.message}"`);
    });

    if (unresolved.length > 0) {
        console.log('\nNOTE: If these alerts exist for a host, new "High Latency" alerts for the same host WILL NOT be created due to deduplication.');
    }
}

main().catch(console.error).finally(() => process.exit());
