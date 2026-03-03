import { routerService } from './src/services/router.service.js';
import { db } from './src/db/index.js';
import { routers, routerNetwatch } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from './src/lib/logger.js';

async function runTest() {
    try {
        // 1. Test Router Coordinate Deletion
        const [router] = await db.select().from(routers).limit(1);
        if (!router) {
            console.log('No routers found to test');
        } else {
            console.log(`Testing with router: ${router.name} (${router.id})`);

            // Set dummy coordinates first
            await routerService.update(router.id, {
                latitude: '1.2345',
                longitude: '6.7890'
            });

            let updated = await routerService.findById(router.id);
            console.log(`Initial coordinates: Lat:${updated?.latitude}, Lng:${updated?.longitude}`);

            // Clear coordinates
            await routerService.update(router.id, {
                latitude: null,
                longitude: null
            });

            updated = await routerService.findById(router.id);
            console.log(`Cleared coordinates: Lat:${updated?.latitude}, Lng:${updated?.longitude}`);

            if (updated?.latitude === null && updated?.longitude === null) {
                console.log('SUCCESS: Router coordinates cleared successfully');
            } else {
                console.log('FAILURE: Router coordinates NOT cleared');
            }
        }

        // 2. Test Netwatch Coordinate Deletion
        const [nw] = await db.select().from(routerNetwatch).limit(1);
        if (!nw) {
            console.log('No netwatch entries found to test');
        } else {
            console.log(`Testing with Netwatch: ${nw.name || nw.host} (${nw.id})`);

            // Set dummy coordinates first
            await routerService.updateNetwatch(nw.routerId, nw.id, {
                latitude: '10.1111',
                longitude: '20.2222'
            });

            let [updatedNw] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, nw.id));
            console.log(`Initial NW coordinates: Lat:${updatedNw?.latitude}, Lng:${updatedNw?.longitude}`);

            // Clear coordinates
            await routerService.updateNetwatch(nw.routerId, nw.id, {
                latitude: null,
                longitude: null
            });

            [updatedNw] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, nw.id));
            console.log(`Cleared NW coordinates: Lat:${updatedNw?.latitude}, Lng:${updatedNw?.longitude}`);

            if (updatedNw?.latitude === null && updatedNw?.longitude === null) {
                console.log('SUCCESS: Netwatch coordinates cleared successfully');
            } else {
                console.log('FAILURE: Netwatch coordinates NOT cleared');
            }
        }

    } catch (error) {
        console.error('Test failed with error:', error);
    } finally {
        process.exit(0);
    }
}

runTest();
