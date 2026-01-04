import 'dotenv/config';
import { routerService } from './src/services/router.service';
import { db } from './src/db';
import { routers, routerNetwatch } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function run() {
    console.log('Running Netwatch sync test...\n');

    const [router] = await db.select().from(routers).limit(1);
    if (!router) {
        console.error('No router found');
        process.exit(1);
    }

    console.log(`Syncing netwatch for router: ${router.name}\n`);

    const result = await routerService.syncNetwatchFromRouter(router.id);
    console.log(`Sync result: ${result.synced} items synced`);
    if (result.errors.length > 0) {
        console.log('Errors:', result.errors);
    }

    console.log('\nChecking database after sync:\n');
    const netwatch = await db
        .select()
        .from(routerNetwatch)
        .where(eq(routerNetwatch.routerId, router.id));

    netwatch.forEach((nw, i) => {
        console.log(`[${i + 1}] ${nw.host} - ${nw.name || '(no name)'}`);
        console.log(`    Status: ${nw.status}`);
        console.log(`    lastUp: ${nw.lastUp ? new Date(nw.lastUp).toISOString() : 'NULL'}`);
        console.log(`    lastDown: ${nw.lastDown ? new Date(nw.lastDown).toISOString() : 'NULL'}`);
        console.log();
    });

    process.exit(0);
}

run();
