
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';

async function diagnose() {
    console.log('--- Router Collision Diagnosis ---');
    const allRouters = await db.select().from(routers);

    console.table(allRouters.map(r => ({
        id: r.id.substring(0, 8),
        name: r.name,
        host: r.host,
        port: r.port,
        serial: r.serialNumber || 'N/A',
        identity: r.identity || 'N/A',
        useWebhook: r.useWebhook,
        hasSecret: !!r.webhookSecret
    })));

    process.exit(0);
}

diagnose().catch(err => {
    console.error(err);
    process.exit(1);
});
