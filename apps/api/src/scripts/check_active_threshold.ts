
import 'dotenv/config';
import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
import fs from 'fs';

async function checkActiveThreshold() {
    console.log('Checking Active THRESHOLD alerts...');

    const activeThresholds = await db
        .select()
        .from(alerts)
        .where(
            and(
                eq(alerts.type, 'threshold'),
                eq(alerts.resolved, false)
            )
        )
        .orderBy(desc(alerts.createdAt));

    const output = [];
    output.push(`Found ${activeThresholds.length} active 'threshold' alerts.`);

    if (activeThresholds.length > 0) {
        output.push('--- Top 5 Active ---');
        activeThresholds.slice(0, 5).forEach(a => {
            output.push(`[${a.createdAt}] ${a.title} - ${a.message} (Ack: ${a.acknowledged})`);
        });
    }

    fs.writeFileSync('active_thresholds.txt', output.join('\n'));
    console.log('Done');
    process.exit(0);
}

checkActiveThreshold();
