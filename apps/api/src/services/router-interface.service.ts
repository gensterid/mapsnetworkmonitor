import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routerInterfaces,
    routerInterfaceMetrics,
    routers,
    type RouterInterface,
} from '../db/schema/index.js';

export class RouterInterfaceService {
    /**
     * Get all interfaces for a router from the database
     */
    async getInterfaces(routerId: string): Promise<RouterInterface[]> {
        return db
            .select()
            .from(routerInterfaces)
            .where(eq(routerInterfaces.routerId, routerId))
            .orderBy(routerInterfaces.name);
    }

    /**
     * Sync and update interface status and traffic rates from MikroTik data
     */
    async syncInterfaces(routerId: string, interfaces: any[]): Promise<void> {
        if (!interfaces) return;

        for (const iface of interfaces) {
            // Check if interface exists in our database
            const [existingInterface] = await db
                .select()
                .from(routerInterfaces)
                .where(and(
                    eq(routerInterfaces.routerId, routerId),
                    eq(routerInterfaces.name, iface.name)
                ));

            if (existingInterface) {
                // Calculate rates (bits per second) based on byte counter differences
                const now = new Date();
                const lastUpdate = existingInterface.lastUpdated || new Date();
                const seconds = (now.getTime() - lastUpdate.getTime()) / 1000;

                let txRate = 0;
                let rxRate = 0;

                if (seconds > 0 && iface.txBytes !== undefined && iface.rxBytes !== undefined) {
                    const txDiff = iface.txBytes - (existingInterface.txBytes || 0);
                    const rxDiff = iface.rxBytes - (existingInterface.rxBytes || 0);

                    // Handle counter wrap or reset: if diff is negative, assume rate is 0 or ignore
                    if (txDiff >= 0) {
                        txRate = Math.round((txDiff * 8) / seconds);
                    }
                    if (rxDiff >= 0) {
                        rxRate = Math.round((rxDiff * 8) / seconds);
                    }
                }

                // Update existing interface record
                await db
                    .update(routerInterfaces)
                    .set({
                        ...iface,
                        status: iface.running ? 'up' : 'down',
                        lastUpdated: new Date(),
                        // calculated rates
                        txRate,
                        rxRate
                    })
                    .where(eq(routerInterfaces.id, existingInterface.id));

                // Store history with rate-limiting (min 5s between points)
                const [lastMetric] = await db
                    .select({ recordedAt: routerInterfaceMetrics.recordedAt })
                    .from(routerInterfaceMetrics)
                    .where(eq(routerInterfaceMetrics.interfaceId, existingInterface.id))
                    .orderBy(desc(routerInterfaceMetrics.recordedAt))
                    .limit(1);

                if (!lastMetric || (new Date().getTime() - lastMetric.recordedAt.getTime() > 5000)) {
                    // Fetch tenantId from router
                    const [router] = await db.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, routerId)).limit(1);

                    await db.insert(routerInterfaceMetrics).values({
                        interfaceId: existingInterface.id,
                        txRate,
                        rxRate,
                        tenantId: router?.tenantId,
                        recordedAt: new Date(),
                    });
                }
            } else {
                // Create new interface record
                await db.insert(routerInterfaces).values({
                    routerId,
                    ...iface,
                    status: iface.running ? 'up' : 'down',
                    txRate: 0,
                    rxRate: 0,
                });
            }
        }
    }

    /**
     * Get historical traffic metrics for an interface
     */
    async getInterfaceHistory(interfaceId: string, limit = 50, tenantId?: string): Promise<any[]> {
        const conditions: any[] = [eq(routerInterfaceMetrics.interfaceId, interfaceId)];
        if (tenantId) {
            conditions.push(eq(routerInterfaceMetrics.tenantId, tenantId));
        }

        return db
            .select()
            .from(routerInterfaceMetrics)
            .where(and(...conditions))
            .orderBy(desc(routerInterfaceMetrics.recordedAt))
            .limit(limit);
    }
}

export const routerInterfaceService = new RouterInterfaceService();
