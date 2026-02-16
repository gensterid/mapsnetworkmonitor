
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper for ESM directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.resolve(__dirname, '../apps/api/.env');
dotenv.config({ path: envPath });

async function main() {
    try {
        const { routerService } = await import('../apps/api/src/services/router.service.js');
        const { db } = await import('../apps/api/src/db/index.js');
        const { routers } = await import('../apps/api/src/db/schema/routers.js');

        // 1. Get a Router ID
        const allRouters = await routerService.findAll();
        const router = allRouters[0];
        if (!router) {
            console.error('No routers found to test with.');
            process.exit(1);
        }
        console.log(`Using Router: ${router.name} (${router.id})`);

        // 2. Create a Dummy Netwatch Entry
        const netwatch = await routerService.createNetwatch(router.id, {
            name: 'Test-Link-Verification',
            host: '1.2.3.4', // Dummy host
            deviceType: 'client',
            interval: 30
        });
        console.log(`Created Netwatch: ${netwatch.id}`);

        // 3. Update with linkedOnuId
        const dummyOnuId = '00000000-0000-0000-0000-000000000000'; // Need a valid UUID format, doesn't need to exist in ONUs table since no FK constraint
        console.log(`Updating with linkedOnuId: ${dummyOnuId}`);

        const updated = await routerService.updateNetwatch(router.id, netwatch.id, {
            linkedOnuId: dummyOnuId,
            name: 'Test-Link-Verification-Updated'
        });

        // 4. Verify
        if (updated?.linkedOnuId === dummyOnuId) {
            console.log('SUCCESS: linkedOnuId was persisted and returned.');
        } else {
            console.error('FAILURE: linkedOnuId was NOT persisted.');
            console.log('Returned object:', updated);
        }

        // 5. Cleanup
        await routerService.deleteNetwatch(router.id, netwatch.id);
        console.log('Cleanup complete.');

    } catch (error) {
        console.error('Error:', error);
    }
    process.exit(0);
}

main();
