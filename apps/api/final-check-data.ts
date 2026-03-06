import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function verifyData() {
    try {
        console.log('--- AUDIT DATA DEVICE PERFORMANCE HISTORY ---');

        // 1. Check Latency Data (From Netwatch / Host)
        const latencyCount = await db.execute(sql`SELECT count(*) FROM device_performance_history WHERE host IS NOT NULL AND latency IS NOT NULL`);
        console.log(`\n[LATENCY / HOST] Found: ${latencyCount[0].count} records`);
        
        if (parseInt(latencyCount[0].count as string) > 0) {
            const latestLatency = await db.execute(sql`SELECT host, latency, recorded_at FROM device_performance_history WHERE host IS NOT NULL AND latency IS NOT NULL ORDER BY recorded_at DESC LIMIT 3`);
            console.log('Sample Latency Data (Host):');
            console.table(latestLatency);
        } else {
            console.log('Warning: No latency records found for Hosts.');
        }

        // 2. Check Signal Data (From OLT / ONU)
        const signalCount = await db.execute(sql`SELECT count(*) FROM device_performance_history WHERE onu_id IS NOT NULL AND signal IS NOT NULL`);
        console.log(`\n[SIGNAL / ONU] Found: ${signalCount[0].count} records`);

        if (parseInt(signalCount[0].count as string) > 0) {
            const latestSignal = await db.execute(sql`SELECT onu_id, signal, recorded_at FROM device_performance_history WHERE onu_id IS NOT NULL AND signal IS NOT NULL ORDER BY recorded_at DESC LIMIT 3`);
            console.log('Sample Signal Data (ONU):');
            console.table(latestSignal);
        } else {
            console.log('Warning: No signal records found for ONUs.');
        }

        // 3. Check Overall Trend
        const lastHour = await db.execute(sql`SELECT count(*) FROM device_performance_history WHERE recorded_at > (now() - interval '1 hour')`);
        console.log(`\n[RECENT] Records in last 1 hour: ${lastHour[0].count}`);

    } catch (err) {
        console.error('Audit Error:', err);
    } finally {
        process.exit(0);
    }
}

verifyData();
