import { performanceAnalyticsService } from './src/services/analytics/performance-analytics.service.js';

async function testPerformanceAPI() {
    const routerId = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3';
    const host = '10.100.100.13';

    // Exact dates from user's error
    const startDate = new Date('2026-02-27T14:34:33.006Z');
    const endDate = new Date('2026-03-06T14:34:33.006Z');
    
    console.log('--- TEST: User Exact Parameters ---');
    try {
        const res = await performanceAnalyticsService.getDevicePerformanceTrends({
            routerId,
            host,
            startDate,
            endDate
        });
        console.log(`Success! Retrieved ${res.length} points.`);
        if(res.length > 0) console.log('Sample:', res.slice(0, 5));
    } catch(err) {
        console.error('Failed Test:', err);
    }

    process.exit(0);
}

testPerformanceAPI();
