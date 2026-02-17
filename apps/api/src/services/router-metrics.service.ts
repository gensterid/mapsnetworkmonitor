import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routerMetrics,
    routerInterfaces,
    routerNetwatch,
    type RouterMetric,
} from '../db/schema/index.js';
import { alertService } from './alert.service.js';
import { snmpService } from './snmp.service.js';
import { parseUptimeToSeconds } from '../lib/mikrotik-api.js';

export class RouterMetricsService {
    /**
     * Get router metrics history
     */
    async getMetricsHistory(
        routerId: string,
        limit = 100
    ): Promise<RouterMetric[]> {
        return db
            .select()
            .from(routerMetrics)
            .where(eq(routerMetrics.routerId, routerId))
            .orderBy(desc(routerMetrics.recordedAt))
            .limit(limit);
    }

    /**
     * Save current resources as metrics and check for threshold alerts
     */
    async saveMetrics(routerId: string, routerName: string, resources: any): Promise<void> {
        if (!resources) return;

        try {
            await db.insert(routerMetrics).values({
                routerId,
                cpuLoad: resources.cpuLoad,
                totalMemory: resources.totalMemory,
                freeMemory: resources.freeMemory,
                usedMemory: resources.usedMemory,
                totalDisk: resources.totalDisk,
                freeDisk: resources.freeDisk,
                usedDisk: resources.usedDisk,
                uptime: resources.uptime ? parseUptimeToSeconds(resources.uptime) : undefined,
                recordedAt: new Date(),
            });

            // Check for metric-based alerts (CPU/Memory thresholds)
            await alertService.checkAndCreateMetricAlerts(
                routerId,
                routerName,
                resources.cpuLoad,
                resources.totalMemory,
                resources.usedMemory
            );
        } catch (err) {
            console.error(`[Router ${routerName}] Failed to save metrics:`, err instanceof Error ? err.message : err);
        }
    }

    /**
     * Get real-time traffic using SNMP (faster/lighter than API)
     * Updates database counters and calculates current rates (bps)
     */
    async getSnmpTraffic(router: any): Promise<Record<string, { tx: number; rx: number }>> {
        const community = router.snmpCommunity || 'public';
        const port = router.snmpPort || 161;

        try {
            // 1. Get interface names and their OID indexes
            const ifNameOid = '1.3.6.1.2.1.31.1.1.1.1';
            const names = await snmpService.walk({ host: router.host, port, community }, ifNameOid);

            const indexToNameMap = new Map<string, string>();
            for (const result of names) {
                const oidParts = result.oid.split('.');
                const index = oidParts[oidParts.length - 1];
                if (result.value) {
                    indexToNameMap.set(index, String(result.value));
                }
            }

            const indexes = Array.from(indexToNameMap.keys());
            if (indexes.length === 0) return {};

            // 2. Prepare OIDs for High Capacity (64-bit) counters
            const oids: string[] = [];
            for (const index of indexes) {
                oids.push(`1.3.6.1.2.1.31.1.1.1.6.${index}`);  // ifHCInOctets (RX)
                oids.push(`1.3.6.1.2.1.31.1.1.1.10.${index}`); // ifHCOutOctets (TX)
            }

            // 3. Fetch current counters in chunks to avoid packet size issues
            const chunkSize = 40;
            const chunks = [];
            for (let i = 0; i < oids.length; i += chunkSize) {
                chunks.push(oids.slice(i, i + chunkSize));
            }

            const trafficData: Record<string, { tx: number; rx: number }> = {};
            for (const chunk of chunks) {
                const results = await snmpService.getMultiple({ host: router.host, port, community }, chunk);
                for (const result of results) {
                    const oidParts = result.oid.split('.');
                    const index = oidParts[oidParts.length - 1];
                    const parent = oidParts.slice(0, -1).join('.');
                    const name = indexToNameMap.get(index);
                    if (!name) continue;

                    if (!trafficData[name]) trafficData[name] = { rx: 0, tx: 0 };

                    if (parent === '1.3.6.1.2.1.31.1.1.1.6') {
                        trafficData[name].rx = Number(result.value);
                    } else if (parent === '1.3.6.1.2.1.31.1.1.1.10') {
                        trafficData[name].tx = Number(result.value);
                    }
                }
            }

            // 4. Calculate rates and update DB
            const calculatedRates: Record<string, { tx: number; rx: number }> = {};
            for (const [name, data] of Object.entries(trafficData)) {
                const [existing] = await db.select().from(routerInterfaces).where(and(
                    eq(routerInterfaces.routerId, router.id),
                    eq(routerInterfaces.name, name)
                ));

                if (existing) {
                    const now = new Date();
                    const lastUpdate = existing.lastUpdated || new Date();
                    const seconds = (now.getTime() - lastUpdate.getTime()) / 1000;
                    let txRate = 0;
                    let rxRate = 0;

                    if (seconds > 0) {
                        const currentTx = data.tx;
                        const currentRx = data.rx;
                        const prevTx = Number(existing.txBytes || 0);
                        const prevRx = Number(existing.rxBytes || 0);

                        // Basic wrap-around / reset protection
                        if (currentTx >= prevTx) txRate = Math.round(((currentTx - prevTx) * 8) / seconds);
                        if (currentRx >= prevRx) rxRate = Math.round(((currentRx - prevRx) * 8) / seconds);
                    }

                    await db.update(routerInterfaces).set({
                        txBytes: data.tx,
                        rxBytes: data.rx,
                        txRate,
                        rxRate,
                        lastUpdated: new Date()
                    }).where(eq(routerInterfaces.id, existing.id));

                    calculatedRates[name] = { tx: txRate, rx: rxRate };

                    // Propagate rates to Netwatch entries linked to this interface
                    try {
                        await db.update(routerNetwatch).set({
                            txRate,
                            rxRate,
                            updatedAt: new Date()
                        }).where(and(
                            eq(routerNetwatch.routerId, router.id),
                            eq(routerNetwatch.targetInterface, name)
                        ));
                    } catch (nwErr) {
                        console.error(`[SNMP] Failed to propagate rate to netwatch for ${name}:`, nwErr);
                    }
                }
            }

            return calculatedRates;
        } catch (error) {
            console.error(`[Router ${router.host}] SNMP traffic failed:`, error instanceof Error ? error.message : error);
            return {};
        }
    }
}

export const routerMetricsService = new RouterMetricsService();
