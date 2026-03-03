import 'dotenv/config';
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { routerService } from './src/services/index.js';
import { logger } from './src/lib/logger.js';

async function forceSync() {
    const allRouters = await db.select().from(routers).where(eq(routers.useWebhook, true));
    console.log(`Found ${allRouters.length} routers with webhook enabled`);

    for (const r of allRouters) {
        console.log(`Force syncing ${r.name} (${r.host})...`);
        try {
            await routerService.refreshRouterStatus(r.id, true, true);
            console.log(`SUCCESS: ${r.name}`);
        } catch (err) {
            console.error(`FAILED: ${r.name} | ${err}`);
        }
    }
    process.exit(0);
}

forceSync();
