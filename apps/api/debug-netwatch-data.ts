import 'dotenv/config';
import { db } from './src/db';
import { routers, routerNetwatch } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function run() {
    console.log('Checking Netwatch data in database...\n');

    // Get first router
    const [router] = await db.select().from(routers).limit(1);
    if (!router) {
        console.error('No router found');
        process.exit(1);
    }

    console.log(`Router: ${router.name} (${router.id})\n`);

    // Get netwatch entries
    const netwatch = await db
        .select()
        .from(routerNetwatch)
        .where(eq(routerNetwatch.routerId, router.id));

    console.log(`Found ${netwatch.length} netwatch entries:\n`);

    netwatch.forEach((nw, i) => {
        console.log(`[${i + 1}] ${nw.host} - ${nw.name || '(no name)'}`);
        console.log(`    Status: ${nw.status}`);
        console.log(`    lastUp: ${nw.lastUp ? new Date(nw.lastUp).toISOString() : 'NULL'}`);
        console.log(`    lastDown: ${nw.lastDown ? new Date(nw.lastDown).toISOString() : 'NULL'}`);
        console.log(`    lastCheck: ${nw.lastCheck ? new Date(nw.lastCheck).toISOString() : 'NULL'}`);
        console.log();
    });

    process.exit(0);
}

run();
