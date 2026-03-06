import { performanceAnalyticsService } from './src/services/analytics/performance-analytics.service.js';

async function testPakZuma() {
    const routerId = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3';
    const host = '10.100.100.13'; // PAK ZUMA
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    console.log('Testing PAK ZUMA (Host only, should resolve ONU)...');
    const res = await performanceAnalyticsService.getDevicePerformanceTrends({
        routerId,
        host,
        startDate,
        endDate
    });

    console.log('Results count:', res.length);
    if (res.length > 0) {
        const hasBoth = res.some(r => r.latency !== null && r.signal !== null);
        const hasLatency = res.some(r => r.latency !== null);
        const hasSignal = res.some(r => r.signal !== null);
        
        console.log('Contains Latency:', hasLatency);
        console.log('Contains Signal:', hasSignal);
        
        const combinedPoints = res.filter(r => r.latency !== null && r.signal !== null);
        console.log('Points with BOTH metrics:', combinedPoints.length);
        
        if (combinedPoints.length > 0) {
            console.log('Sample combined data:', JSON.stringify(combinedPoints.slice(0, 2), null, 2));
        } else {
            console.log('Sample raw data:', JSON.stringify(res.slice(0, 5), null, 2));
        }
    } else {
        console.log('No data found for the given range.');
    }
}

testPakZuma().catch(console.error);
