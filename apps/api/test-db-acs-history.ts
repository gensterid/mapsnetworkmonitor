import { db } from './src/db/index.js';
import { devicePerformanceHistory, onus, routerNetwatch } from './src/db/schema/index.js';
import { sql, isNotNull, desc, eq } from 'drizzle-orm';

async function checkData() {
    console.log('📊 Checking Device Performance History Data for ACS devices...');
    
    // Check if there are any records with signal
    const [withSignal] = await db.select({ count: sql<number>`count(*)` })
        .from(devicePerformanceHistory)
        .where(isNotNull(devicePerformanceHistory.signal));
    console.log(`Records with Signal: ${withSignal.count}`);
    
    // Let's get 5 recent signal records
    if (withSignal.count > 0) {
        console.log('\n--- Recent Signal Records ---');
        const recent = await db.select({
            id: devicePerformanceHistory.id,
            onuId: devicePerformanceHistory.onuId,
            host: devicePerformanceHistory.host,
            signal: devicePerformanceHistory.signal,
            recordedAt: devicePerformanceHistory.recordedAt
        })
        .from(devicePerformanceHistory)
        .where(isNotNull(devicePerformanceHistory.signal))
        .orderBy(desc(devicePerformanceHistory.recordedAt))
        .limit(5);
        
        for (const r of recent) {
            let sn = 'Unknown';
            let hostFromOnu = '';
            if (r.onuId) {
                const [onu] = await db.select({ sn: onus.sn, host: onus.host }).from(onus).where(eq(onus.id, r.onuId)).limit(1);
                if (onu) {
                    sn = onu.sn;
                    hostFromOnu = onu.host;
                }
            }
            console.log(`[${r.recordedAt.toISOString()}] ONU ID: ${r.onuId} (SN: ${sn}, Host: ${hostFromOnu}), PerfHost: ${r.host}, Signal: ${r.signal} dBm`);
            
            // Try to resolve netwatch by host
            if (hostFromOnu) {
                const netwatches = await db.select({ id: routerNetwatch.id, host: routerNetwatch.host, linkedOnuId: routerNetwatch.linkedOnuId })
                                           .from(routerNetwatch).where(eq(routerNetwatch.host, hostFromOnu));
                console.log(`  Matching Netwatch:`, netwatches);
            }
        }
    } else {
        console.log('\n❌ No signal records found!');
    }
}

checkData().catch(console.error).finally(() => process.exit(0));
