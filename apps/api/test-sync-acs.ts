import { genieacsService } from './src/services/genieacs.service.js';
import { db } from './src/db/index.js';
import { tenants } from './src/db/schema/index.js';

async function testSync() {
    console.log('🔄 Triggering ACS Sync Metadata...');
    
    // Get first tenant
    const [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant) {
        console.log('No tenant found!');
        return;
    }
    
    // Sync all routers that have ACS configured
    const syncedOLTCount = await genieacsService.syncMetadata(undefined, tenant.id);
    console.log(`✅ Synced! Created/Updated ${syncedOLTCount} OLTs (virtual representation).`);
    
    // Check if ONUs now have IP adresses
    const { onus, devicePerformanceHistory } = await import('./src/db/schema/index.js');
    const { isNotNull, isNull, and } = await import('drizzle-orm');
    
    const onusWithHost = await db.select().from(onus).where(isNotNull(onus.host));
    const onusWithoutHost = await db.select().from(onus).where(isNull(onus.host));
    
    console.log(`ONUs with Host (IP): ${onusWithHost.length}`);
    console.log(`ONUs without Host: ${onusWithoutHost.length}`);
    
    if (onusWithHost.length > 0) {
        console.log('\n--- Sample ONUs with Host ---');
        console.log(onusWithHost.slice(0, 5).map(o => ({ sn: o.sn, host: o.host })));
    }
}

testSync().catch(console.error).finally(() => process.exit(0));
