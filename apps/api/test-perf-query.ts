import { performanceAnalyticsService } from './src/services/analytics/performance-analytics.service.js';
import { db } from './src/db/index.js';
import { onus } from './src/db/schema/index.js';
import { isNotNull, desc } from 'drizzle-orm';

async function testQuery() {
    console.log('🧪 Testing Performance Analytics Trends Query...');
    
    // Grab a recent ONU that has a signal record
    const { devicePerformanceHistory } = await import('./src/db/schema/index.js');
    const recent = await db.select({
        onuId: devicePerformanceHistory.onuId
    })
    .from(devicePerformanceHistory)
    .where(isNotNull(devicePerformanceHistory.signal))
    .orderBy(desc(devicePerformanceHistory.recordedAt))
    .limit(1);

    if (recent.length === 0 || !recent[0].onuId) {
        console.log('No recent ONU signal records found.');
        return;
    }

    const onuId = recent[0].onuId!;
    console.log(`Using ONU ID: ${onuId}`);

    // Try to get its host
    let host = '192.168.1.1'; // dummy host
    const onu = await db.query.onus.findFirst({
        where: (onus, { eq }) => eq(onus.id, onuId)
    });
    if (onu && onu.host) {
        host = onu.host;
    }
    
    console.log(`Passed Host: ${host}`);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // 7 days

    const results = await performanceAnalyticsService.getDevicePerformanceTrends({
        routerId: undefined, // leave undefined to get all
        host: host,
        onuId: onuId,
        startDate,
        endDate
    });

    console.log('\n--- Query Results ---');
    console.log(results.slice(-5)); // show last 5
}

testQuery().catch(console.error).finally(() => process.exit(0));
