import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routers,
    routerMetrics,
    routerInterfaces,
    routerInterfaceMetrics,
    routerNetwatch,
    type RouterMetric,
    type RouterInterface,
} from '../db/schema/index.js';
import { alertService } from './alert.service.js';
import { snmpService } from './snmp.service.js';
import { interfaceRepository } from '../repositories/interface.repository.js';
import { parseUptimeToSeconds, parseSnmpValue } from '../lib/mikrotik-api.js';
import { logger } from '../lib/logger.js';

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
    async saveMetrics(routerId: string, routerName: string, tenantId: string, resources: any, tx: any = db): Promise<void> {
        if (!resources) return;

        try {
            await tx.insert(routerMetrics).values({
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
            });

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

            // 4. Pre-fetch all interfaces for this router to avoid N+1 queries
            const existingInterfaces = await interfaceRepository.findByRouterId(router.id, tx);
            
            const interfaceMap = new Map<string, RouterInterface>(
                existingInterfaces.map((i: RouterInterface) => [i.name, i])
            );

            // 5. Pre-fetch latest metric timestamps to avoid N+1 queries for history
            const interfaceIds = existingInterfaces.map((i: RouterInterface) => i.id);
            const lastMetrics = interfaceIds.length > 0 ? await tx
                .select({ 
                    interfaceId: routerInterfaceMetrics.interfaceId, 
                    recordedAt: sql<Date>`max(${routerInterfaceMetrics.recordedAt})` 
                })
                .from(routerInterfaceMetrics)
                .where(inArray(routerInterfaceMetrics.interfaceId, interfaceIds))
                .groupBy(routerInterfaceMetrics.interfaceId) 
                : [];
            
            const lastMetricMap = new Map<string, Date>(
                lastMetrics.map((m: any) => [m.interfaceId, m.recordedAt])
            );

            // 6. Calculate rates and update DB
            const calculatedRates: Record<string, { tx: number; rx: number }> = {};
            for (const [name, data] of Object.entries(trafficData)) {
                if (isNaN(data.tx) || isNaN(data.rx)) continue;

                const existing = interfaceMap.get(name);
                if (existing) {
                    const now = new Date();
                    const lastUpdate = existing.lastUpdated ? new Date(existing.lastUpdated) : new Date();
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

                                // SPIKE GUARD: Cap at 100Gbps and log the event for investigation
                                const MAX_EXPECTED_BPS = 100_000_000_000; // 100 Gbps
                                if (txRate > MAX_EXPECTED_BPS || rxRate > MAX_EXPECTED_BPS) {
                                    logger.warn({
                                        router: router.name,
                                        interface: name,
                                        txRate,
                                        rxRate,
                                        currentTx: currentTx.toString(),
                                        prevTx: prevTx.toString(),
                                        currentRx: currentRx.toString(),
                                        prevRx: prevRx.toString(),
                                        seconds
                                    }, '⚠️ Detected suspicious SNMP traffic spike, capping to 0 bps');
                                    
                                    if (txRate > MAX_EXPECTED_BPS) txRate = 0;
                                    if (rxRate > MAX_EXPECTED_BPS) rxRate = 0;
                                }
                            }
                        } catch (calcErr) {
                            logger.error({ err: calcErr, router: router.name, interface: name }, 'Failed to calculate BigInt traffic rates');
                        }
                    }
 
                    await tx.update(routerInterfaces).set({
                        txBytes: String(data.tx),
                        rxBytes: String(data.rx),
                        txRate,
                        rxRate,
                        lastUpdated: new Date()
                    }).where(eq(routerInterfaces.id, existing.id));

                    // Store history with rate-limiting (min 5s between points)
                    const lastRecordedAt = lastMetricMap.get(existing.id);

                    if (!lastRecordedAt || (now.getTime() - new Date(lastRecordedAt).getTime() > 5000)) {
                        await tx.insert(routerInterfaceMetrics).values({
                            interfaceId: existing.id,
                            txRate,
                            rxRate,
                            tenantId: router.tenantId,
                            recordedAt: new Date(),
                        });
                    }

                    calculatedRates[name] = { tx: txRate, rx: rxRate };

                    // Propagate rates to Netwatch entries linked to this interface
                    try {
                        await tx.update(routerNetwatch).set({
                            txRate,
                            rxRate,
                            updatedAt: new Date()
                        }).where(and(
                            eq(routerNetwatch.routerId, router.id),
                            eq(routerNetwatch.targetInterface, name)
                        ));
                    } catch (nwErr) {
                        logger.error({ err: nwErr, iface: name }, '[SNMP] Failed to propagate rate to netwatch');
                    }
                }
            }

            // Update SNMP status on success
            await tx.update(routers).set({
                snmpStatus: 'online',
                lastSnmpError: null,
                updatedAt: new Date()
            }).where(eq(routers.id, router.id));

            // Resolve any active SNMP error alerts
            try {
                await alertService.resolveSnmpErrorAlert(router.id, tx);
            } catch (alertErr) {
                logger.error({ err: alertErr, routerId: router.id }, 'Failed to resolve SNMP alert');
            }

            // Emit real-time event for success
            try {
                const { eventEmitter } = await import('./event-emitter.service.js');
                eventEmitter.broadcast('router:updated', {
                    id: router.id,
                    snmpStatus: 'online',
                    lastSnmpError: null,
                    tenantId: router.tenantId
                });
            } catch (evErr) {}

            return calculatedRates;
        } catch (error: any) {
            logger.error({ err: error.message, host: snmpHost }, 'SNMP traffic failed');
            
            // Update SNMP status on failure
            try {
                await tx.update(routers).set({
                    snmpStatus: 'error',
                    lastSnmpError: error.message,
                    updatedAt: new Date()
                }).where(eq(routers.id, router.id));

                // Create/Update SNMP error alert
                try {
                    await alertService.createSnmpErrorAlert(router.id, router.name, error.message, tx);
                } catch (alertErr) {
                    logger.error({ err: alertErr, routerId: router.id }, 'Failed to create SNMP alert');
                }

                // Emit real-time event for failure
                const { eventEmitter } = await import('./event-emitter.service.js');
                eventEmitter.broadcast('router:updated', {
                    id: router.id,
                    snmpStatus: 'error',
                    lastSnmpError: error.message,
                    tenantId: router.tenantId
                });
            } catch (dbErr) {
                // Ignore DB error here if transaction failed
            }
            
            return {};
        }
    }
}

export const routerMetricsService = new RouterMetricsService();
