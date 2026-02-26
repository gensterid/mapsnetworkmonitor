import 'dotenv/config';
import { db } from './src/db/index.js';
import { appSettings } from './src/db/schema/settings.js';
import { eq } from 'drizzle-orm';

async function reset() {
    console.log('Deleting googleMapsApiKey overrides from database...');
    const result = await db.delete(appSettings).where(eq(appSettings.key, 'googleMapsApiKey'));
    console.log('Successfully removed overrides. All tenants will now use the global Key from .env.');
    process.exit(0);
}

reset().catch(err => {
    console.error(err);
    process.exit(1);
});
