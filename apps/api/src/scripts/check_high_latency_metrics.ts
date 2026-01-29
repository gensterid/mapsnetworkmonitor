
import 'dotenv/config';
import { db } from '../db/index.js';
import { routerNetwatch } from '../db/schema/index.js';
import { gt, desc, and } from 'drizzle-orm';
import fs from 'fs';

async function checkMetrics() {
    console.log('Checking recent High Latency metrics...');

    // limit to last 30 minutes ideally, but let's just get all high latency
    const highLatency = await db
        .select()
        .from(routerNetwatch)
        .where(gt(routerNetwatch.latency, 100))
        .orderBy(desc(routerNetwatch.lastCheck))
        .limit(20);

    const output = [];
    output.push(`Found ${highLatency.length} netwatch entries with latency > 100.`);

    if (highLatency.length > 0) {
        output.push('--- Top 20 High Latency ---');
        highLatency.forEach(r => {
            output.push(`[${r.lastCheck}] Host: ${r.host} (${r.name}) - Latency: ${r.latency}ms, PacketLoss: ${r.packetLoss}%`);
        });
    } else {
        output.push('No entries found with latency > 100ms.');
    }

    fs.writeFileSync('high_latency_metrics.txt', output.join('\n'));
    console.log('Done');
    process.exit(0);
}

checkMetrics();
