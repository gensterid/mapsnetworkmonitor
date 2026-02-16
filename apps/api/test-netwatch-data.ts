
import { routerService } from './src/services/router.service.js';

async function main() {
    // Assuming a router ID, let's just fetch for all or a specific one if known
    // But better yet, let's just test the SQL result for a specific host
    console.log('--- Testing Netwatch Enrichment for 10.100.100.12 ---');
    try {
        const routers = await import('./src/db/schema/index.js').then(m => m.routers);
        const { db } = await import('./src/db/index.js');
        const [firstRouter] = await db.select().from(routers).limit(1);

        if (!firstRouter) {
            console.log('No routers found.');
            process.exit(0);
        }

        const netwatch = await routerService.getNetwatch(firstRouter.id);
        const gani = netwatch.find(n => n.host === '10.100.100.12');

        if (gani) {
            console.log('GANI Entry:', JSON.stringify({
                host: gani.host,
                latitude: gani.latitude,
                longitude: gani.longitude,
                sn: gani.sn,
                physicalStatus: gani.physicalStatus
            }, null, 2));
        } else {
            console.log('GANI not found in Netwatch for router', firstRouter.name);
        }
    } catch (err) {
        console.error('Test failed:', err);
    }
    process.exit(0);
}

main();
