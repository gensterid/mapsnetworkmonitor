import { performanceAnalyticsService } from './src/services/analytics/performance-analytics.service.js';

async function testLinkedAPI() {
    const routerId = '63223049-db91-4a32-a671-6f977b09c2cd';
    const host = '192.168.19.214'; // GUTU-2
    const onuId = 'b8453041-e332-4343-813f-05d1ec921831';
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    console.log('Testing with ONU ID + Host...');
    const res = await performanceAnalyticsService.getDevicePerformanceTrends({
        routerId,
        host,
        onuId,
        startDate,
        endDate
    });

    console.log('Results count:', res.length);
    if (res.length > 0) {
        const samples = res.filter(r => r.latency !== null || r.signal !== null).slice(0, 3);
        console.log('Sample data points:', JSON.stringify(samples, null, 2));
        
        const hasBoth = res.some(r => r.latency !== null && r.signal !== null);
        const hasLatency = res.some(r => r.latency !== null);
        const hasSignal = res.some(r => r.signal !== null);
        
        console.log('Contains Latency:', hasLatency);
        console.log('Contains Signal:', hasSignal);
        console.log('Contains both in same point:', hasBoth);
    }
}

testLinkedAPI().catch(console.error);
