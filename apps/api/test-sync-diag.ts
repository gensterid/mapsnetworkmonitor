import { db } from './src/db/index.js';
import { onus, olts } from './src/db/schema/index.js';
import { eq, and, isNotNull, inArray } from 'drizzle-orm';
import { routerNetwatchService } from './src/services/router-netwatch.service.js';

async function test() {
    const routerId = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3'; // From user log
    try {
        console.log('Testing Full Sync...');
        const result = await routerNetwatchService.fullSync(routerId);
        console.log('Sync Result:', result);
    } catch (err) {
        console.error('DIAGNOSTIC FAILED:', err);
    } finally {
        process.exit(0);
    }
}

test();
