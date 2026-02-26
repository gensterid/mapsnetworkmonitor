import 'dotenv/config';
import { db } from './src/db/index.js';
import { appSettings } from './src/db/schema/settings.js';
import { eq } from 'drizzle-orm';

async function check() {
    console.log('--- GLOBAL CONFIG ---');
    console.log('process.env.GOOGLE_MAPS_API_KEY:', process.env.GOOGLE_MAPS_API_KEY ? 'EXISTS (length: ' + process.env.GOOGLE_MAPS_API_KEY.length + ')' : 'MISSING');

    console.log('\n--- DATABASE OVERRIDES ---');
    const settings = await db.select().from(appSettings).where(eq(appSettings.key, 'googleMapsApiKey'));

    if (settings.length === 0) {
        console.log('No overrides found in database. All tenants should use global key.');
    } else {
        settings.forEach(s => {
            console.log(`Tenant: ${s.tenantId} | Key: ${s.value ? (typeof s.value === 'string' ? (s.value.length > 5 ? s.value.substring(0, 10) + '...' : s.value) : 'NOT A STRING') : 'EMPTY/NULL'}`);
        });
    }
    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
