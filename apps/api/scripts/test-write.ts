
import 'dotenv/config';
import { connectToRouter } from '../src/lib/mikrotik-api';
import { db } from '../src/db';
import { routers } from '../src/db/schema';
import { decrypt } from '../src/lib/encryption';

async function main() {
    console.log('Testing api.write...');

    const [router] = await db.select().from(routers).limit(1);
    if (!router) {
        console.error('No router found');
        return;
    }

    const password = decrypt(router.passwordEncrypted);
    console.log(`Connecting to ${router.host}...`);

    const api = await connectToRouter({
        host: router.host,
        port: router.port,
        username: router.username,
        password: password,
    });

    try {
        console.log('Fetching /system/identity/print...');
        const identity = await api.write('/system/identity/print');
        console.log('Identity:', JSON.stringify(identity, null, 2));

        console.log('Fetching /interface/print...');
        const interfaces = await api.write('/interface/print');
        console.log('Interfaces count:', interfaces.length);
        if (interfaces.length > 0) console.log('First interface:', interfaces[0]);

        api.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
