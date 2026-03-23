import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    routers,
    routerMetrics,
    routerInterfaces,
    routerInterfaceMetrics,
    routerNetwatch,
    type RouterMetric,
} from '../db/schema/index.js';
import { alertService } from './alert.service.js';
import { snmpService } from './snmp.service.js';
import { parseUptimeToSeconds } from '../lib/mikrotik-api.js';
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

        const community = router.snmpCommunity || 'public';
        const port = router.snmpPort || 161;

        try {
            // 1. Get interface names and their OID indexes
            const ifNameOid = '1.3.6.1.2.1.31.1.1.1.1';
            logger.info({ router: router.name, host: router.host, port, community }, '[SNMP Debug] Attempting walk');
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
            const chunkSize = 20;
            const chunks = [];
            for (let i = 0; i < oids.length; i += chunkSize) {
                chunks.push(oids.slice(i, i + chunkSize));
            }

            const trafficData: Record<string, { tx: number; rx: number }> = {};
            
            // Helper to parse SNMP values (handles Counter64 Buffers)
            const parseSnmpValue = (val: any): number => {
                if (Buffer.isBuffer(val)) {
                    // Counter64 is 8 bytes big-endian
                    try {
                        return Number(val.readBigUInt64BE());
                    } catch (e) {
                        return 0;
                    }
                }
                const num = Number(val);
                return isNaN(num) ? 0 : num;
            };

            for (const chunk of chunks) {
                const results = await snmpService.getMultiple({ host: router.host, port, community }, chunk);
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

            // 4. Calculate rates and update DB
            const calculatedRates: Record<string, { tx: number; rx: number }> = {};
            for (const [name, data] of Object.entries(trafficData)) {
                // Ensure we don't proceed with NaN
                if (isNaN(data.tx) || isNaN(data.rx)) continue;

                const [existing] = await tx.select().from(routerInterfaces).where(and(
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
                        
                        // Ensure rates are also valid numbers
                        if (isNaN(txRate)) txRate = 0;
                        if (isNaN(rxRate)) rxRate = 0;
                    }
 
                    await tx.update(routerInterfaces).set({
                        txBytes: String(data.tx),
                        rxBytes: String(data.rx),
                        txRate,
                        rxRate,
                        lastUpdated: new Date()
                    }).where(eq(routerInterfaces.id, existing.id));

                    // Store history with rate-limiting (min 5s between points)
                    const [lastMetric] = await tx
                        .select({ recordedAt: routerInterfaceMetrics.recordedAt })
                        .from(routerInterfaceMetrics)
                        .where(eq(routerInterfaceMetrics.interfaceId, existing.id))
                        .orderBy(desc(routerInterfaceMetrics.recordedAt))
                        .limit(1);

                    if (!lastMetric || (new Date().getTime() - lastMetric.recordedAt.getTime() > 5000)) {
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

            logger.info({ router: router.name }, '✅ [SNMP Success] Background traffic poll completed');
            return calculatedRates;
        } catch (error: any) {
            logger.error({ err: error.message, host: router.host }, 'SNMP traffic failed');
            
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
