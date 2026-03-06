import { routerSyncService } from './src/services/router-sync.service.js';
import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function testSync() {
    const routerId = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3';
    const tenantId = '559d4954-45d5-490a-94be-04c517fd91ff';
    
    console.log(`Starting manual sync for router ${routerId}...`);
    try {
        // This will trigger syncHosts -> measureLatency
        // includeNetwatch = true, isFullSync = true
        await routerSyncService.refreshRouterStatus(routerId, true, true, tenantId);
        console.log('Sync call completed.');

        // Wait a bit for async measureLatency (though it's awaited in refreshRouterStatus)
        const countRes = await db.execute(sql`SELECT count(*) FROM device_performance_history WHERE host IS NOT NULL`);
        console.log('Rows in device_performance_history with valid host:', countRes[0]?.count);
        
        if (parseInt(countRes[0]?.count as string) > 0) {
            const samples = await db.execute(sql`SELECT * FROM device_performance_history WHERE host IS NOT NULL ORDER BY recorded_at DESC LIMIT 5`);
            console.log('Latest performance logs:');
            console.log(JSON.stringify(samples, null, 2));
        }

    } catch (err) {
        console.error('Error during sync test:', err);
    } finally {
        process.exit(0);
    }
}

testSync();
