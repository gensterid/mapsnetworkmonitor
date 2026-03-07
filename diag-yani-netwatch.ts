import { db } from './apps/api/src/db/index.js';
import { routers } from './apps/api/src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { connectToRouter, getNetwatchHosts, getRouterClock } from './apps/api/src/lib/mikrotik-api.js';
import { decrypt } from './apps/api/src/lib/encryption.js';

async function diag() {
    console.log('--- Diag: YANI Router Netwatch ---');
    const [router] = await db.select().from(routers).where(eq(routers.name, 'YANI'));
    if (!router) {
        console.error('Router YANI not found in DB');
        process.exit(1);
    }

    console.log(`Router: ${router.name} (${router.host})`);
    console.log(`Webhook Enabled: ${router.useWebhook}`);
    console.log(`Webhook Secret: ${router.webhookSecret}`);

    const password = router.passwordEncrypted ? decrypt(router.passwordEncrypted) : '';
    
    let conn;
    try {
        conn = await connectToRouter({
            host: router.host,
            port: router.port || 8728,
            username: router.username,
            password: password
        });

        const clock = await getRouterClock(conn);
        const hosts = await getNetwatchHosts(conn, clock);

        console.log(`Found ${hosts.length} netwatch hosts on MikroTik:`);
        hosts.forEach((h, i) => {
            console.log(`\n[${i}] Host: ${h.host}`);
            console.log(`    Comment: ${h.comment}`);
            console.log(`    Status: ${h.status}`);
            console.log(`    Up Script: ${h.upScript}`);
            console.log(`    Down Script: ${h.downScript}`);
            const hasOurToken = router.webhookSecret && (h.upScript?.includes(router.webhookSecret) || h.downScript?.includes(router.webhookSecret));
            console.log(`    Has Our Token: ${hasOurToken}`);
        });

    } catch (err) {
        console.error('Error connecting or fetching:', err);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

diag();
