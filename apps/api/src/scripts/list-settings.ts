
import { db } from '../db/index.js';
import { appSettings } from '../db/schema/index.js';

async function listSettings() {
    const settings = await db.select().from(appSettings);
    console.log(JSON.stringify(settings, null, 2));
    process.exit(0);
}

listSettings();
