import { db } from './src/db/index.js';
import { routerNetwatch, routers } from './src/db/schema/index.js';
import { eq, lt } from 'drizzle-orm';
import { connectToRouter, getNetwatchHosts } from './src/lib/mikrotik-api.js';
import { decrypt } from './src/lib/encryption.js';

async function main() {
    try {
        const HOST_TO_CHECK = '10.100.100.22';
        const ROUTER_ID = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3'; // genster

        const [router] = await db
            .select()
            .from(routers)
            .where(eq(routers.id, ROUTER_ID));

        if (!router) {
            console.error('Router not found');
            process.exit(1);
        }

        console.log(`Connecting to router: ${router.name} (${router.host})...`);
        const password = decrypt(router.passwordEncrypted);

        const conn = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: password
        });

        console.log('Fetching Netwatch from MikroTik...');
        const mikrotikNetwatch = await getNetwatchHosts(conn);
        console.log(`Total Netwatch on MikroTik: ${mikrotikNetwatch.length}`);

        const found = mikrotikNetwatch.find(nw => nw.host === HOST_TO_CHECK);
        if (found) {
            console.log(`✅ FOUND: ${HOST_TO_CHECK} is still on MikroTik.`);
            console.log('Data:', JSON.stringify(found, null, 2));
        } else {
            console.log(`❌ NOT FOUND: ${HOST_TO_CHECK} is missing from MikroTik Netwatch list!`);
            console.log('This explains why the API is not updating it.');
        }

        await conn.close();
        process.exit(0);
    } catch (err) {
        console.error('Failed to verify:', err);
        process.exit(1);
    }
}

main();
