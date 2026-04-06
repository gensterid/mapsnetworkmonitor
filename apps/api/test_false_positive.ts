import 'dotenv/config';
import { routerSyncService } from './src/services/router-sync.service.js';
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from './src/lib/logger.js';

async function testSync() {
    console.log('[TEST] Getting router YANI...');
    const r = await db.select().from(routers).where(eq(routers.name, 'YANI'));
    if (!r[0]) {
        console.log('Router YANI not found');
        process.exit(1);
    }
    
    console.log('[TEST] Refreshing status...');
    const result = await routerSyncService.refreshRouterStatus(r[0].id, false, true, r[0].tenantId);
    
    const r2 = await db.select().from(routers).where(eq(routers.name, 'YANI'));
    console.log('\n================================');
    console.log('YANI STATUS:', r2[0].status);
    console.log('ERROR MESSAGE:', r2[0].lastErrorMessage || 'none');
    console.log('API RESULT:', result ? 'Returned Router (Success API)' : 'Returned undefined (Quirk/Fatal)');
    console.log('================================\n');
    
    process.exit(0);
}

testSync().catch((e) => {
    console.error(e);
    process.exit(1);
});
