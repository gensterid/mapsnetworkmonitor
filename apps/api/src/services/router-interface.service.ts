import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routerInterfaces,
    routerInterfaceMetrics,
    routers,
    type RouterInterface,
} from '../db/schema/index.js';

import { interfaceRepository } from '../repositories/interface.repository.js';

export class RouterInterfaceService {
    /**
     * Get all interfaces for a router from the database
     */
    async getInterfaces(routerId: string): Promise<RouterInterface[]> {
        return interfaceRepository.findByRouterId(routerId);
    }

    /**
     * Sync and update interface status and traffic rates from MikroTik data
     */
    async syncInterfaces(
        routerId: string, 
        interfaces: any[], 
        tx: any = db, 
        snmpStatus?: string,
        trafficMap?: Map<string, { tx: number, rx: number }>,
        useSnmp: boolean = true
    ): Promise<void> {
        if (!interfaces) return;

        const isSnmpPrimary = snmpStatus === 'online' && useSnmp;

        // Pre-fetch all interfaces for this router once to avoid N+1 queries
        const existingInterfaces = await interfaceRepository.findByRouterId(routerId, tx);
        
        const interfaceMap = new Map<string, RouterInterface>(
            existingInterfaces.map((i: RouterInterface) => [i.name, i])
        );

        for (const iface of interfaces) {
            const existingInterface = interfaceMap.get(iface.name);

            if (existingInterface) {
                // Update basic metadata (status, etc)
                const updateData: any = {
                    ...iface,
                    status: iface.running ? 'up' : 'down',
                    lastUpdated: new Date()
                };

                // SMART FALLBACK: Only update traffic if SNMP is NOT online
                if (!isSnmpPrimary) {
                    let txRate = 0;
                    let rxRate = 0;

                    // A: Use direct traffic map if provided (from /interface/monitor-traffic)
                    if (trafficMap && trafficMap.has(iface.name)) {
                        const stats = trafficMap.get(iface.name)!;
                        txRate = stats.tx;
                        rxRate = stats.rx;
                    } 
                    // B: Calculate rates (bits per second) based on byte counter differences
                    else {
                        const now = new Date();
                        const lastUpdate = existingInterface.lastUpdated || new Date();
                        const seconds = (now.getTime() - lastUpdate.getTime()) / 1000;

                        if (seconds > 5 && iface.txBytes !== undefined && iface.rxBytes !== undefined) {
                            const currentTx = Number(iface.txBytes);
                            const currentRx = Number(iface.rxBytes);
                            const prevTx = Number(existingInterface.txBytes || 0);
                            const prevRx = Number(existingInterface.rxBytes || 0);

                            const txDiff = currentTx - prevTx;
                            const rxDiff = currentRx - prevRx;

                            // SPIKE GUARD: If previous value was 0 (first sync) and direct rate not available,
                            // assume rate is 0 to avoid huge jumps from byte counter resets.
                            if (prevTx === 0 || prevRx === 0) {
                                txRate = 0;
                                rxRate = 0;
                            } else if (txDiff >= 0 && rxDiff >= 0) {
                                // Handle counter wrap or reset: if diff is negative, assume rate is 0 or ignore
                                txRate = Math.round((txDiff * 8) / seconds);
                                rxRate = Math.round((rxDiff * 8) / seconds);

                                // Sanity check: Cap at 100Gbps
                                if (txRate > 100000000000) txRate = 0;
                                if (rxRate > 100000000000) rxRate = 0;
                            }
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
