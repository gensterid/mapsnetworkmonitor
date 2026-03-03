import 'dotenv/config';
import { db } from './src/db/index.js';
import { routers, routerNetwatch } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';

async function diagnose() {
    try {
        const allRouters = await db.select().from(routers);

        console.log('--- ALL ROUTERS ---');
        for (const r of allRouters) {
            console.log(`ID: ${r.id} | Name: ${r.name.padEnd(10)} | Host: ${r.host.padEnd(20)} | UseWebhook: ${r.useWebhook} | Secret: ${!!r.webhookSecret}`);
        }

        console.log('\n--- NETWATCH ENTRIES WITH WEBHOOK ---');
        const webhooks = await db.select().from(routerNetwatch).where(eq(routerNetwatch.hasWebhook, true));
        for (const w of webhooks) {
            console.log(`RouterID: ${w.routerId} | Host: ${w.host.padEnd(15)} | Status: ${w.status}`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

diagnose();
