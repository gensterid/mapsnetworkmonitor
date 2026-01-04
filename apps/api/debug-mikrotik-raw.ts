import 'dotenv/config';
import { db } from './src/db';
import { routers } from './src/db/schema';
import { connectToRouter } from './src/lib/mikrotik-api';
import { decrypt } from './src/lib/encryption';

async function run() {
    console.log('Fetching raw Netwatch data from MikroTik...\n');

    const [router] = await db.select().from(routers).limit(1);
    if (!router) {
        console.error('No router found');
        process.exit(1);
    }

    const password = decrypt(router.passwordEncrypted);
    const api = await connectToRouter({
        host: router.host,
        port: router.port,
        username: router.username,
        password: password,
    });

    const result = await api.write('/tool/netwatch/print');

    console.log('Raw data from MikroTik:');
    console.log(JSON.stringify(result, null, 2));

    api.close();
    process.exit(0);
}

run();
