import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routerInterfaces,
    routerInterfaceMetrics,
    routers,
    type RouterInterface,
} from '../db/schema/index.js';

import { interfaceRepository } from '../repositories/interface.repository.js';
import { logger } from '../lib/logger.js';
import {
    checkInterfaceSpeed,
    type InterfaceSpeedSample,
} from './automation/checks/interface-speed.check.js';

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

        // Automation: kumpulkan interface yang nilai speed-nya berubah. Dibanding
        // di sini karena `existingInterface` masih memuat nilai SEBELUM update —
        // pola sama seperti snapshot redaman lama pada sync OLT.
        const speedSamples: InterfaceSpeedSample[] = [];

        for (const iface of interfaces) {
            const existingInterface = interfaceMap.get(iface.name);

            if (existingInterface) {
                const now = new Date();

                // Syarat `iface.speed` truthy penting: saat port down MikroTik tak
                // mengirim speed (undefined), dan Drizzle melewati field undefined
                // sehingga kolom DB tetap menyimpan nilai lama. Tanpa guard ini
                // perbandingan "1Gbps !== undefined" bernilai true SELAMANYA untuk
                // tiap port mati → query router sia-sia tiap siklus poll.
                if (iface.speed && existingInterface.speed !== iface.speed) {
                    speedSamples.push({
                        interfaceId: existingInterface.id,
                        name: iface.name,
                        oldSpeed: existingInterface.speed ?? null,
                        newSpeed: iface.speed ?? null,
                    });
                }
                // Update basic metadata (status, etc)
                const updateData: any = {
                    ...iface,
                    status: iface.running ? 'up' : 'down',
                    lastUpdated: now
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
                        const lastUpdate = existingInterface.lastTrafficAt ? new Date(existingInterface.lastTrafficAt) : (existingInterface.lastUpdated ? new Date(existingInterface.lastUpdated) : now);
                        const seconds = (now.getTime() - lastUpdate.getTime()) / 1000;

                        if (seconds > 5 && iface.txBytes !== undefined && iface.rxBytes !== undefined) {
                            try {
                                const currentTx = BigInt(iface.txBytes);
                                const currentRx = BigInt(iface.rxBytes);
                                const prevTx = BigInt(existingInterface.txBytes || '0');
                                const prevRx = BigInt(existingInterface.rxBytes || '0');

                                // SPIKE GUARD: If previous value was 0 (first sync) and direct rate not available,
                                // assume rate is 0 to avoid huge jumps from byte counter resets.
                                if (prevTx === 0n || prevRx === 0n) {
                                    txRate = 0;
                                    rxRate = 0;
                                } else {
                                    if (currentTx >= prevTx) {
                                        const diffTx = currentTx - prevTx;
                                        txRate = Number((diffTx * 8n) / BigInt(Math.max(1, Math.round(seconds))));
                                    }
                                    if (currentRx >= prevRx) {
                                        const diffRx = currentRx - prevRx;
                                        rxRate = Number((diffRx * 8n) / BigInt(Math.max(1, Math.round(seconds))));
                                    }

                                    if (isNaN(txRate)) txRate = 0;
                                    if (isNaN(rxRate)) rxRate = 0;

                                    // Sanity check: Cap at 100Gbps and log spikes
                                    const MAX_EXPECTED_BPS = 100_000_000_000; // 100 Gbps
                                    if (txRate > MAX_EXPECTED_BPS || rxRate > MAX_EXPECTED_BPS) {
                                        // We log this as info/debug because API stats are sometimes volatile during ROS sync
                                        logger.info({
                                            routerId,
                                            interface: iface.name,
                                            txRate,
                                            rxRate,
                                            seconds
                                        }, '📡 Capping volatile API traffic rate to 0 bps');
                                        
                                        if (txRate > MAX_EXPECTED_BPS) txRate = 0;
                                        if (rxRate > MAX_EXPECTED_BPS) rxRate = 0;
                                    }
                                }
                            } catch (calcErr) {
                                logger.error({ err: calcErr, routerId, interface: iface.name }, 'Failed to calculate BigInt API traffic rates');
                                txRate = 0;
                                rxRate = 0;
                            }
                        }
                    }

                    updateData.txRate = txRate;
                    updateData.rxRate = rxRate;
                    updateData.lastTrafficAt = now;
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

                    if (!lastMetric || (new Date().getTime() - new Date(lastMetric.recordedAt).getTime() > 5000)) {
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

        // Automation: evaluasi penurunan kecepatan link. Sengaja DI LUAR loop
        // (router di-query sekali, hanya bila memang ada perubahan) dan best-effort
        // — kegagalan di sini tidak boleh menggagalkan sync interface.
        if (speedSamples.length > 0) {
            try {
                const [router] = await db
                    .select({ tenantId: routers.tenantId, name: routers.name })
                    .from(routers)
                    .where(eq(routers.id, routerId))
                    .limit(1);

                // alerts.tenant_id NOT NULL → tanpa tenant, lewati saja.
                if (router?.tenantId) {
                    await checkInterfaceSpeed({
                        routerId,
                        tenantId: router.tenantId,
                        routerName: router.name || routerId,
                        samples: speedSamples,
                    });
                } else {
                    // Router tanpa tenant adalah anomali integritas data — jangan
                    // dibuang diam-diam, operator perlu tahu.
                    logger.warn({ routerId }, 'Automation: router tanpa tenantId — cek speed dilewati');
                }
            } catch (err) {
                logger.warn({ err, routerId }, 'Automation: interface speed check gagal (diabaikan)');
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
