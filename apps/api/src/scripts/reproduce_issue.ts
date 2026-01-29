
import 'dotenv/config';
import { db } from '../db/index.js';
import { routers, alerts } from '../db/schema/index.js';
import { alertService } from '../services/alert.service.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

function log(message: string) {
    fs.appendFileSync('reproduction_log.txt', message + '\n');
    console.log(message);
}

async function main() {
    log('Starting reproduction script...');

    // 1. Get a router
    const [router] = await db.select().from(routers).limit(1);
    if (!router) {
        log('Error: No router found to attach alert to.');
        return;
    }
    log(`Using router: ${router.name} (${router.id})`);

    // 2. Create a high latency alert manually
    log('Creating test high latency alert...');
    const randomId = Math.floor(Math.random() * 10000);
    const host = `10.10.10.${randomId}`;
    const deviceName = `Test Device ${randomId}`;

    const alert = await alertService.createPerformanceAlert(
        router.id,
        router.name,
        host,
        deviceName,
        150, // 150ms latency > 100ms threshold
        0
    );

    if (!alert) {
        log('Alert was NOT created. Possibly deduplicated?');
        // Let's force create one raw if service blocked it (should not happen with random ID)
        const [rawAlert] = await db.insert(alerts).values({
            routerId: router.id,
            type: 'threshold',
            severity: 'warning',
            title: 'TEST High Latency (Fallback)',
            message: 'TEST High Latency Alert 150ms',
            acknowledged: false,
            resolved: false,
        }).returning();
        log(`Force created raw alert: ${rawAlert.id}`);
    } else {
        log(`Alert created via service: ${alert.id}`);
        log(`Created Title: ${alert.title}`);
        log(`Created Message: ${alert.message}`);
    }

    // 3. Query alerts with category='issues'
    log('Querying alerts with category="issues"...');
    const result = await alertService.findAll({
        limit: 10,
        category: 'issues',
        sortOrder: 'desc'
    });

    // 4. Check if our alert is in the list
    // Check for "High Latency" specifically in the TITLE now
    const found = result.data.find(a => a.title.includes('High Latency') || a.message.includes('High Latency detected'));

    if (found) {
        log('SUCCESS: High latency alert found in "issues" category!');
        log(`Alert: ${found.title} [${found.type}] severity=${found.severity}`);
        if (!found.title.includes('High Latency')) {
            log('WARNING: Alert found but title does not contain "High Latency". Verify implementation.');
        }
    } else {
        log('FAILURE: High latency alert NOT found in "issues" category.');
        log('Top 5 issues found (backend returned):');
        result.data.slice(0, 5).forEach(a => log(`- ${a.title} [${a.type}]`));
    }

    // Cleanup
    if (found && found.title.includes('TEST')) {
        log('Cleaning up test alert...');
        await db.delete(alerts).where(eq(alerts.id, found.id));
    }
}

main().catch(err => log(`Error: ${err}`)).finally(() => process.exit());
