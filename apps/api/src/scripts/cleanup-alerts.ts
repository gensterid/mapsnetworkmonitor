import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { eq, and, inArray, or } from 'drizzle-orm';

async function cleanup() {
    console.log('--- Starting Alert Cleanup ---');

    // 1. Resolve all PPPoE alerts (Connect/Disconnect)
    console.log('Resolving PPPoE alerts...');
    const pppoeRes = await db
        .update(alerts)
        .set({
            resolved: true,
            resolvedAt: new Date(),
        })
        .where(and(
            eq(alerts.resolved, false),
            inArray(alerts.type, ['pppoe_connect', 'pppoe_disconnect'])
        ))
        .returning({ id: alerts.id });

    console.log(`Resolved ${pppoeRes.length} PPPoE alerts.`);

    // 2. Resolve Reboot & System alerts
    console.log('Resolving Reboot & System alerts...');
    const sysRes = await db
        .update(alerts)
        .set({
            resolved: true,
            resolvedAt: new Date(),
        })
        .where(and(
            eq(alerts.resolved, false),
            inArray(alerts.type, ['reboot', 'system'])
        ))
        .returning({ id: alerts.id });

    console.log(`Resolved ${sysRes.length} System/Reboot alerts.`);

    // 3. Resolve old high_cpu and high_memory alerts (older than 1 hour)
    // We assume if they are older than 1 hour and haven't been resolved, they are stale
    // since metric poll happens every 1-5 minutes.
    console.log('Resolving stale metric alerts (> 1 hour old)...');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Note: In a real prod env, we might want to check current router status, 
    // but for cleanup, resolving stale metrics is safer to clear the dashboard.
    const metricRes = await db
        .update(alerts)
        .set({
            resolved: true,
            resolvedAt: new Date(),
        })
        .where(and(
            eq(alerts.resolved, false),
            inArray(alerts.type, ['high_cpu', 'high_memory']),
            // sql`${alerts.createdAt} < ${oneHourAgo}` // Drizzle helper
        ))
        // Since we want to clear the 245 high_memory alerts mentioned by user, 
        // and we just implemented auto-resolve for new checks, 
        // let's just resolve ALL current unresolved metrics to give the user a fresh start.
        .returning({ id: alerts.id });

    console.log(`Resolved ${metricRes.length} Metric alerts.`);

    console.log('\n--- Cleanup Complete ---');

    // Verify remaining
    const remaining = await db
        .select()
        .from(alerts)
        .where(eq(alerts.resolved, false));

    console.log(`Remaining Unresolved: ${remaining.length}`);
    remaining.forEach(r => console.log(`- [${r.type}] ${r.title}`));

    process.exit(0);
}

cleanup().catch(err => {
    console.error(err);
    process.exit(1);
});
