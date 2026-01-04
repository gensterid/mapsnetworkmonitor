import { db } from '../db';
import { alerts, routerNetwatch, routers } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Cleanup orphaned alerts - resolve alerts for devices that are actually UP
 */
async function cleanupOrphanedAlerts() {
    try {
        console.log('🧹 Starting cleanup of orphaned alerts...');

        // Get all unresolved netwatch_down alerts
        const unresolvedAlerts = await db
            .select()
            .from(alerts)
            .where(and(
                eq(alerts.type, 'netwatch_down'),
                eq(alerts.resolved, false)
            ));

        console.log(`Found ${unresolvedAlerts.length} unresolved netwatch_down alerts`);

        let resolvedCount = 0;

        for (const alert of unresolvedAlerts) {
            // Extract IP from alert message
            const ipMatch = alert.message.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (!ipMatch) continue;

            const host = ipMatch[1];

            // Check current status in routerNetwatch
            const [netwatch] = await db
                .select()
                .from(routerNetwatch)
                .where(and(
                    eq(routerNetwatch.routerId, alert.routerId),
                    eq(routerNetwatch.host, host)
                ));

            if (netwatch && netwatch.status === 'up') {
                // Device is UP but alert is still unresolved - fix it!
                await db
                    .update(alerts)
                    .set({
                        resolved: true,
                        resolvedAt: new Date(),
                    })
                    .where(eq(alerts.id, alert.id));

                console.log(`✅ Resolved orphaned alert ${alert.id} for ${host} (device is currently UP)`);
                resolvedCount++;
            }
        }

        console.log(`🧹 Cleanup complete: ${resolvedCount} orphaned alerts resolved`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
}

cleanupOrphanedAlerts();
