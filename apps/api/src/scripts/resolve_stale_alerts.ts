
import 'dotenv/config';
import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import fs from 'fs';

function log(msg: string) {
    fs.appendFileSync('resolve_log.txt', msg + '\n');
    console.log(msg);
}

async function main() {
    log('Resolving stale High Latency / Performance Issue alerts...');

    // Find unresolved threshold alerts
    const staleAlerts = await db.select()
        .from(alerts)
        .where(
            and(
                eq(alerts.type, 'threshold'),
                eq(alerts.resolved, false)
            )
        );

    log(`Found ${staleAlerts.length} unresolved threshold alerts.`);

    if (staleAlerts.length > 0) {
        const ids = staleAlerts.map(a => a.id);

        await db.update(alerts)
            .set({
                resolved: true,
                resolvedAt: new Date(),
                message: (a) => a.message + ' (Auto-resolved by system to clear stale performance alerts)'
            })
            .where(inArray(alerts.id, ids));

        log(`Successfully resolved ${staleAlerts.length} alerts.`);
        log('This will allow NEW High Latency alerts to be generated for these hosts.');
    } else {
        log('No stale alerts found.');
    }
}

main().catch(err => log(`Error: ${err}`)).finally(() => process.exit());
