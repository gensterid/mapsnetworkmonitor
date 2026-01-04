import 'dotenv/config';
import { db } from './src/db';
import { routers } from './src/db/schema';
import { connectToRouter, getNetwatchHosts, updateNetwatchEntry } from './src/lib/mikrotik-api';
import { decrypt } from './src/lib/encryption';
import { eq } from 'drizzle-orm';

async function run() {
    console.log('Starting Netwatch Debug...');

    // 1. Get first router
    const [router] = await db.select().from(routers).limit(1);
    if (!router) {
        console.error('No router found in DB');
        process.exit(1);
    }

    console.log(`Connecting to router: ${router.host}`);
    const password = decrypt(router.passwordEncrypted);

    try {
        const api = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: password,
        });
        console.log('Connected.');

        // 2. Fetch Netwatch
        console.log('Fetching Netwatch items...');
        const items = await getNetwatchHosts(api);
        console.log(`Found ${items.length} items.`);

        if (items.length === 0) {
            console.log('No items to test update.');
            process.exit(0);
        }

        const target = items[0];
        console.log(`Testing update on item: host=${target.host}, id=${target._id}`);

        // 3. Try Update using explicit Array format (Current implementation)
        try {
            console.log('Attempting update with current array format...');
            // Manually replicate the function logic to see raw error
            // const params = [`=.id=${target._id}`, `=comment=${target.comment || ''}_test`];
            // console.log('Params:', params);
            // await api.write('/tool/netwatch/set', params);

            await updateNetwatchEntry(api, target.host, { comment: (target.comment || '') + '_debug' });
            console.log('Update SUCCESS!');

            // Revert
            await updateNetwatchEntry(api, target.host, { comment: target.comment || '' });
            console.log('Revert SUCCESS!');

        } catch (e) {
            console.error('Update FAILED with error:');
            console.error(e);
        }

        api.close();

    } catch (e) {
        console.error('General Error:', e);
    }

    process.exit(0);
}

run();
