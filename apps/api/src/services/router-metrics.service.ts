import { metricRepository } from '../repositories/metric.repository.js';
import { netwatchRepository } from '../repositories/netwatch.repository.js';
import { interfaceRepository } from '../repositories/interface.repository.js';
import { type RouterMetric, type RouterInterface } from '../db/schema/index.js';
import { parseUptimeToSeconds, parseSnmpValue } from '../lib/mikrotik-api.js';
import { alertService } from './alert.service.js';
import { snmpService } from './snmp.service.js';
import { logger } from '../lib/logger.js';
import { db } from '../db/index.js'; // Keep db for direct access if needed, but strive for repos

export class RouterMetricsService {
    /**
     * Get router metrics history
     */
    async getMetricsHistory(
        routerId: string,
        limit = 100
    ): Promise<RouterMetric[]> {
        return metricRepository.getRouterHistory(routerId, { limit });
    }

    /**
     * Save current resources as metrics and check for threshold alerts
     */
    async saveMetrics(routerId: string, routerName: string, tenantId: string, resources: any, tx: any = db): Promise<void> {
        if (!resources) return;

        try {
            await metricRepository.insertRouterMetrics([{
                routerId,
                tenantId,
                cpuLoad: resources.cpuLoad,
                totalMemory: resources.totalMemory,
                freeMemory: resources.freeMemory,
                usedMemory: resources.usedMemory,
                totalDisk: resources.totalDisk,
                freeDisk: resources.freeDisk,
                usedDisk: resources.usedDisk,
                uptime: resources.uptime ? parseUptimeToSeconds(resources.uptime) : undefined,
                recordedAt: new Date(),
            }], tx);

            // Check for metric-based alerts (CPU/Memory thresholds)
            await alertService.checkAndCreateMetricAlerts(
                routerId,
                routerName,
                resources.cpuLoad,
                resources.totalMemory,
                resources.usedMemory,
                tx
            );
        } catch (err) {
            logger.error({ err, router: routerName }, 'Failed to save metrics');
        }
    }

    /**
     * Get real-time traffic using SNMP (faster/lighter than API)
     * Updates database counters and calculates current rates (bps)
     */
    async getSnmpTraffic(router: any, tx: any = db): Promise<Record<string, { tx: number; rx: number }>> {
        if (router.useSnmp === false) {
            return {};
        }

        const snmpHost = router.snmpHost || router.host;
        const community = router.snmpCommunity || 'public';
        const port = router.snmpPort || 161;

        try {
            // 1. Get interface names and their OID indexes
            const ifNameOid = '1.3.6.1.2.1.31.1.1.1.1';
            const names = await snmpService.walk({ host: snmpHost, port, community }, ifNameOid);

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

            // 3. Fetch all counters in chunked requests to avoid SNMP packet size limits
            const chunkSize = 20; // 10 interfaces per request (2 OIDs each)
            const trafficData: Record<string, { rx: number; tx: number }> = {};
            
            for (let i = 0; i < oids.length; i += chunkSize) {
                const chunk = oids.slice(i, i + chunkSize);
                const results = await snmpService.getMultiple({ host: snmpHost, port, community }, chunk);

                for (const result of results) {
                    const oidParts = result.oid.split('.');
                    const index = oidParts[oidParts.length - 1];
                    const name = indexToNameMap.get(index);
                    if (!name) continue;

                    if (!trafficData[name]) trafficData[name] = { rx: 0, tx: 0 };

                    if (result.oid.startsWith('1.3.6.1.2.1.31.1.1.1.6.')) { // ifHCInOctets (RX)
                        trafficData[name].rx = parseSnmpValue(result.value);
                    } else if (result.oid.startsWith('1.3.6.1.2.1.31.1.1.1.10.')) { // ifHCOutOctets (TX)
                        trafficData[name].tx = parseSnmpValue(result.value);
                    }
                }
            }

            // 4. Pre-fetch all interfaces for this router via repository
            const existingInterfaces = await interfaceRepository.findByRouterId(router.id, tx);
            const interfaceMap = new Map<string, RouterInterface>(
                existingInterfaces.map((i: RouterInterface) => [i.name, i])
            );

            // 5. Pre-fetch latest metric timestamps via repository
            const interfaceIds = existingInterfaces.map((i: RouterInterface) => i.id);
            const lastMetricsRaw = await metricRepository.findLatestForInterfaces(interfaceIds, tx);
            const lastMetrics = (lastMetricsRaw as any).rows || lastMetricsRaw;
            
            const lastMetricMap = new Map<string, Date>(
                lastMetrics.map((m: any) => [m.interface_id || m.interfaceId, m.recorded_at || m.recordedAt])
            );

            // 6. Calculate rates and update DB
            const calculatedRates: Record<string, { tx: number; rx: number }> = {};
            for (const [name, data] of Object.entries(trafficData)) {
                if (isNaN(data.tx) || isNaN(data.rx)) continue;

                const existing = interfaceMap.get(name);
                if (existing) {
                    const now = new Date();
                    const lastUpdate = existing.lastTrafficAt ? new Date(existing.lastTrafficAt) : (existing.lastUpdated ? new Date(existing.lastUpdated) : now);
                    const seconds = (now.getTime() - lastUpdate.getTime()) / 1000;
                    let txRate = 0;
                    let rxRate = 0;

                    if (seconds > 5) {
                        try {
                            const currentTx = BigInt(data.tx);
                            const currentRx = BigInt(data.rx);
                            const prevTx = BigInt(existing.txBytes || '0');
                            const prevRx = BigInt(existing.rxBytes || '0');

                            if (prevTx > 0n && prevRx > 0n) {
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

                                // SPIKE GUARD: Cap at 100Gbps
                                const MAX_EXPECTED_BPS = 100_000_000_000;
                                if (txRate > MAX_EXPECTED_BPS || rxRate > MAX_EXPECTED_BPS) {
                                    logger.warn({ router: router.name, interface: name, txRate, rxRate }, 'Detected traffic spike, capping');
                                    if (txRate > MAX_EXPECTED_BPS) txRate = 0;
                                    if (rxRate > MAX_EXPECTED_BPS) rxRate = 0;
                                }
                            }
                        } catch (calcErr) {
                            logger.error({ err: calcErr, router: router.name, interface: name }, 'Failed to calculate rates');
                        }
                    }
 
                    // Update main interface table
                    const { routerInterfaces } = await import('../db/schema/index.js');
                    const { eq } = await import('drizzle-orm');
                    await tx.update(routerInterfaces).set({
                        txBytes: String(data.tx),
                        rxBytes: String(data.rx),
                        txRate: Math.round(txRate),
                        rxRate: Math.round(rxRate),
                        lastTrafficAt: now,
                        lastUpdated: now
                    }).where(eq(routerInterfaces.id, existing.id));

                    // Store history via repository
                    const lastRecordedAt = lastMetricMap.get(existing.id);
                    if (!lastRecordedAt || (now.getTime() - new Date(lastRecordedAt).getTime() > 5000)) {
                        await metricRepository.insertInterfaceMetrics([{
                            interfaceId: existing.id,
                            txRate,
                            rxRate,
                            tenantId: router.tenantId,
                            recordedAt: new Date(),
                        }], tx);
                    }

                    calculatedRates[name] = { tx: txRate, rx: rxRate };

                    // Propagate rates to Netwatch via repository Utilities
                    try {
                        const { routerNetwatch } = await import('../db/schema/index.js');
                        const { and, eq } = await import('drizzle-orm');
                        await tx.update(routerNetwatch).set({
                            txRate,
                            rxRate,
                            updatedAt: new Date()
                        }).where(and(
                            eq(routerNetwatch.routerId, router.id),
                            eq(routerNetwatch.targetInterface, name)
                        ));
                    } catch (nwErr) {}
                }
            }

            // Sync SNMP status back to router via repository/direct
            const { routers } = await import('../db/schema/index.js');
            const { eq } = await import('drizzle-orm');
            await tx.update(routers).set({
                snmpStatus: 'online',
                lastSnmpError: null,
                updatedAt: new Date()
            }).where(eq(routers.id, router.id));

            try {
                await alertService.resolveSnmpErrorAlert(router.id, tx);
            } catch (evErr) {}

            return calculatedRates;
        } catch (error: any) {
            logger.error({ err: error.message, host: snmpHost }, 'SNMP traffic failed');
            return {};
        }
    }
}

export const routerMetricsService = new RouterMetricsService();
