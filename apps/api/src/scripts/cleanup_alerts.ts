
import 'dotenv/config';
import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { eq, lt, and, inArray, isNull, sql } from 'drizzle-orm';

async function cleanupAlerts() {
    console.log('Starting alert cleanup...');

    // 1. Resolve all "Event" based alerts that are technically just logs
    // Types: pppoe_connect, pppoe_disconnect, status_change (Device UP/DOWN/OFFLINE/ONLINE events)
    // Note: status_change creates a persistent state for some, but typically "Device is UP" is an event.
    // However, "Device is Down" might be considered a state until it's UP.
    // The alert.service logic tries to resolve 'netwatch_down' when 'up' happens.
    // But 'pppoe_connect' and 'pppoe_disconnect' are definitely events.

    const eventTypes = ['pppoe_connect', 'pppoe_disconnect', 'status_change', 'reboot'];

    console.log(`Resolving all alerts of types: ${eventTypes.join(', ')}...`);

    const eventUpdate = await db
        .update(alerts)
        .set({
            resolved: true,
            resolvedAt: new Date()
        })
        .where(
            and(
                inArray(alerts.type, eventTypes as any[]),
                eq(alerts.resolved, false)
            )
        )
        .returning({ id: alerts.id });

    console.log(`Resolved ${eventUpdate.length} event-based alerts.`);

    // 2. Resolve ALL alerts older than 7 days (Housekeeping)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    console.log(`Resolving all alerts older than 7 days (${sevenDaysAgo.toISOString()})...`);

    const oldUpdate = await db
        .update(alerts)
        .set({
            resolved: true,
            resolvedAt: new Date()
        })
        .where(
            and(
                lt(alerts.createdAt, sevenDaysAgo),
                eq(alerts.resolved, false)
            )
        )
        .returning({ id: alerts.id });

    console.log(`Resolved ${oldUpdate.length} old alerts.`);

    // 3. Optional: Delete really old alerts (e.g. > 30 days) to save space?
    // Let's just resolve for now as requested.

    // 4. Handle 'high_memory' / 'high_cpu' that are stuck? 
    // If they are older than 24h, probably safe to resolve.
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const staleMetricUpdate = await db
        .update(alerts)
        .set({
            resolved: true,
            resolvedAt: new Date()
        })
        .where(
            and(
                inArray(alerts.type, ['high_memory', 'high_cpu', 'high_disk', 'threshold'] as any[]),
                lt(alerts.createdAt, oneDayAgo),
                eq(alerts.resolved, false)
            )
        )
        .returning({ id: alerts.id });

    console.log(`Resolved ${staleMetricUpdate.length} stale metric/threshold alerts (older than 24h).`);

    console.log('Cleanup complete.');
    process.exit(0);
}

cleanupAlerts();
