import { routerService } from './src/services/router.service.js';
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';

async function main() {
    try {
        const [router] = await db.select().from(routers).where(eq(routers.name, 'genster'));
        if (!router) {
            console.error('Router genster not found');
            process.exit(1);
        }

        console.log('Forcing full sync for genster...');
        await routerService.refreshRouterStatus(router.id, true, true);
        console.log('Sync complete!');
        process.exit(0);
    } catch (err) {
        console.error('Sync failed:', err);
        process.exit(1);
    }
}

main();
