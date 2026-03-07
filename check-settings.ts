import { db } from './apps/api/src/db/index.js';
import { appSettings } from './apps/api/src/db/schema/index.js';

async function checkSettings() {
    console.log('--- Checking app_settings table ---');
    const settings = await db.select().from(appSettings);
    console.log(`Found ${settings.length} settings records.`);
    
    settings.forEach(s => {
        console.log(`Tenant: ${s.tenantId} | Key: ${s.key} | Value: ${JSON.stringify(s.value)}`);
    });
    
    process.exit(0);
}

checkSettings().catch(err => {
    console.error(err);
    process.exit(1);
});
