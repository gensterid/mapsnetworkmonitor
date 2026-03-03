
import { connectToRouter } from './apps/api/src/lib/mikrotik-api.js';
import { decrypt } from './apps/api/src/lib/encryption.js';
import { db } from './apps/api/src/db/index.js';
import { routers } from './apps/api/src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config({ path: './apps/api/.env' });

async function diagnose() {
    const routerId = process.argv[2];
    if (!routerId) {
        console.error('Usage: tsx diag-raw-netwatch.ts <router_id>');
        process.exit(1);
    }

    const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
    if (!router) {
        console.error('Router not found');
        process.exit(1);
    }

    const password = decrypt(router.passwordEncrypted);
    const api = await connectToRouter({
        host: router.host,
        port: router.port,
        username: router.username,
        password: password
    });

    console.log(`Connecting to ${router.name} (${router.host})...`);

    // 1. Get ALL fields for first 5 netwatch entries
    const rawAll = await api.write('/tool/netwatch/print', []);
    console.log('\n--- RAW OUTPUT (All Fields) ---');
    console.log(JSON.stringify(rawAll.slice(0, 3), null, 2));

    // 2. Check specific .proplist names
    const propList = '.id,host,up-script,down-script,up_script,down_script,comment';
    const rawProp = await api.write('/tool/netwatch/print', [`=.proplist=${propList}`]);
    console.log(`\n--- .proplist OUTPUT (${propList}) ---`);
    console.log(JSON.stringify(rawProp.slice(0, 3), null, 2));

    await api.close();
}

diagnose().catch(console.error);
