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
    async syncInterfaces(routerId: string, interfaces: any[], tx: any = db, snmpStatus?: string): Promise<void> {
        if (!interfaces) return;

        const isSnmpPrimary = snmpStatus === 'online';

        for (const iface of interfaces) {
            // Check if interface exists in our database
            const [existingInterface] = await tx
                .select()
                .from(routerInterfaces)
                .where(and(
                    eq(routerInterfaces.routerId, routerId),
                    eq(routerInterfaces.name, iface.name)
                ));

            if (existingInterface) {
                // Update basic metadata (status, etc)
                const updateData: any = {
                    ...iface,
                    status: iface.running ? 'up' : 'down',
                    lastUpdated: new Date()
                };

                // SMART FALLBACK: Only update traffic if SNMP is NOT online
                if (!isSnmpPrimary) {
                    // Calculate rates (bits per second) based on byte counter differences
                    const now = new Date();
                    const lastUpdate = existingInterface.lastUpdated || new Date();
                    const seconds = (now.getTime() - lastUpdate.getTime()) / 1000;

                    let txRate = 0;
                    let rxRate = 0;

                    if (seconds > 0 && iface.txBytes !== undefined && iface.rxBytes !== undefined) {
                        const txDiff = Number(iface.txBytes) - Number(existingInterface.txBytes || 0);
                        const rxDiff = Number(iface.rxBytes) - Number(existingInterface.rxBytes || 0);

                        // Handle counter wrap or reset: if diff is negative, assume rate is 0 or ignore
                        if (txDiff >= 0) {
                            txRate = Math.round((txDiff * 8) / seconds);
                        }
                        if (rxDiff >= 0) {
                            rxRate = Math.round((rxDiff * 8) / seconds);
                        }
                    }

                    updateData.txRate = txRate;
                    updateData.rxRate = rxRate;
                } else {
                    // Keep existing rates if SNMP is primary to prevent "flashing" or zeroing
                    // unless we want to show 0 if SNMP fails, but here we just leave it alone
                    // because SNMP poller will update it soon.
                    delete updateData.txBytes;
                    delete updateData.rxBytes;
                    delete updateData.txRate;
                    delete updateData.rxRate;
                    delete updateData.txPackets;
                    delete updateData.rxPackets;
                    delete updateData.txDrops;
                    delete updateData.rxDrops;
                    delete updateData.txErrors;
                    delete updateData.rxErrors;
                }

                // Update existing interface record
                await tx
                    .update(routerInterfaces)
                    .set(updateData)
                    .where(eq(routerInterfaces.id, existingInterface.id));

                // SMART FALLBACK: Only store history if SNMP is NOT online
                if (!isSnmpPrimary) {
                    // Store history with rate-limiting (min 5s between points)
                    const [lastMetric] = await tx
                        .select({ recordedAt: routerInterfaceMetrics.recordedAt })
                        .from(routerInterfaceMetrics)
                        .where(eq(routerInterfaceMetrics.interfaceId, existingInterface.id))
                        .orderBy(desc(routerInterfaceMetrics.recordedAt))
                        .limit(1);

                    if (!lastMetric || (new Date().getTime() - lastMetric.recordedAt.getTime() > 5000)) {
                        // Fetch tenantId from router
                        const [router] = await tx.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, routerId)).limit(1);
    
                        await tx.insert(routerInterfaceMetrics).values({
                            interfaceId: existingInterface.id,
                            txRate: updateData.txRate || 0,
                            rxRate: updateData.rxRate || 0,
                            tenantId: router?.tenantId,
                            recordedAt: new Date(),
                        });
                    }
                }
            } else {
                // Create new interface record
                await tx.insert(routerInterfaces).values({
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
