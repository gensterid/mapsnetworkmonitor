import { db } from '../db/index.js';
import { devicePerformanceHistory, onus, routerNetwatch } from '../db/schema/index.js';
import { eq, isNull, and, sql, inArray } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

async function repairLinkage() {
    logger.info('🚀 Starting Linkage Repair (Latency & Signal Correlation)');

    // 1. Fetch all ONUs with host to build a fast lookup map
    const allOnus = await db.select({ id: onus.id, host: onus.host }).from(onus).where(sql`${onus.host} IS NOT NULL`);
    const hostToOnuId = new Map(allOnus.map(o => [o.host, o.id]));
    logger.info({ count: hostToOnuId.size }, 'Built host-to-onu map from onus table');

    // 2. Fetch all netwatch entries for additional fallback links
    const netwatchLinks = await db.select({ host: routerNetwatch.host, linkedOnuId: routerNetwatch.linkedOnuId })
        .from(routerNetwatch)
        .where(sql`${routerNetwatch.linkedOnuId} IS NOT NULL`);
    
    netwatchLinks.forEach(link => {
        if (link.host && link.linkedOnuId && !hostToOnuId.has(link.host)) {
            hostToOnuId.set(link.host, link.linkedOnuId);
        }
    });
    logger.info({ count: hostToOnuId.size }, 'Enriched map with netwatch links');

    // 3. Find historical records with NULL onuId
    const orphanRecords = await db.select({ host: devicePerformanceHistory.host })
        .from(devicePerformanceHistory)
        .where(isNull(devicePerformanceHistory.onuId))
        .groupBy(devicePerformanceHistory.host);

    logger.info({ orphanHosts: orphanRecords.length }, 'Found orphaned performance hosts');

    let repairedTotal = 0;

    for (const record of orphanRecords) {
        if (!record.host) continue;
        
        const targetOnuId = hostToOnuId.get(record.host);
        if (targetOnuId) {
            const result = await db.update(devicePerformanceHistory)
                .set({ onuId: targetOnuId })
                .where(and(
                    isNull(devicePerformanceHistory.onuId),
                    eq(devicePerformanceHistory.host, record.host)
                ));
            
            repairedTotal += (result as any).rowCount || 0;
            logger.info({ host: record.host, onuId: targetOnuId }, 'Repaired linkage for host');
        }
    }

    logger.info({ totalRepaired: repairedTotal }, '🎉 Linkage Repair Completed Successfully');
    process.exit(0);
}

repairLinkage().catch(err => {
    logger.error({ err }, 'Linkage Repair Failed');
    process.exit(1);
});
