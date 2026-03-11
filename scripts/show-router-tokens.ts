import { db } from '../apps/api/src/db/index.js';
import { routers } from '../apps/api/src/db/schema/index.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    const allRouters = await db.select({
        id: routers.id,
        name: routers.name,
        host: routers.host,
        identity: routers.identity,
        webhookSecret: routers.webhookSecret,
        useWebhook: routers.useWebhook,
        status: routers.status,
    }).from(routers);

    if (allRouters.length === 0) {
        console.log('No routers found in the database.');
        process.exit(0);
    }

    console.log('='.repeat(120));
    console.log('DAFTAR ROUTER - ID & TOKEN (webhookSecret)');
    console.log('='.repeat(120));
    console.log('');

    for (const r of allRouters) {
        console.log(`Router: ${r.name || '(no name)'}`);
        console.log(`  ID       : ${r.id}`);
        console.log(`  Host     : ${r.host}`);
        console.log(`  Identity : ${r.identity || '-'}`);
        console.log(`  Status   : ${r.status}`);
        console.log(`  Webhook  : ${r.useWebhook ? 'AKTIF' : 'TIDAK AKTIF'}`);
        console.log(`  Token    : ${r.webhookSecret || '(belum ada token)'}`);
        console.log('-'.repeat(120));
    }

    console.log('');
    console.log(`Total: ${allRouters.length} router(s)`);
    process.exit(0);
}

main().catch(console.error);
