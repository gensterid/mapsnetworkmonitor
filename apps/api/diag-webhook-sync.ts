import 'dotenv/config';
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { routerService } from './src/services/router.service.js';
import { eq, and, sql } from 'drizzle-orm';

async function runDiag() {
    const hostArg = process.argv[2];
    if (!hostArg) {
        console.log('Usage: npx tsx diag-webhook-sync.ts <router_host_or_ip>');
        process.exit(1);
    }

    console.log(`🔍 Diagnosing Webhook Sync for Host: ${hostArg}...`);

    try {
        let router: any = null;

        // 1. Try exact host match
        [router] = await db.select().from(routers).where(eq(routers.host, hostArg));

        // 2. Try host:port split if not found
        if (!router && hostArg.includes(':')) {
            const [h, p] = hostArg.split(':');
            [router] = await db.select().from(routers).where(
                and(
                    eq(routers.host, h),
                    eq(routers.port, parseInt(p))
                )
            );
        }

        // 3. Try Name match if still not found
        if (!router) {
            [router] = await db.select().from(routers).where(
                sql`LOWER(${routers.name}) = LOWER(${hostArg})`
            );
        }

        if (!router) {
            console.error('❌ Router not found in database (tried Host, Host:Port, and Name)');
            console.log('💡 Tip: Try using just the IP or just the name of the router from the dashboard.');
            process.exit(1);
        }

        console.log(`✅ Found Router: ${router.name} (${router.id})`);
        console.log(`⚙️ Webhook Setting: ${router.useWebhook ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🔑 Has Webhook Secret: ${!!router.webhookSecret}`);

        console.log('🔄 Triggering Manual Sync (Full Refresh)...');
        // We use refreshRouterStatus with includeNetwatch = true
        const result = await routerService.refreshRouterStatus(router.id, true, true, router.tenantId || undefined);

        console.log('✅ Sync Completed.');
        if (result) {
            console.log('📊 Router Status After Sync:', result.status);
            console.log('🕒 Last Full Sync:', result.lastFullSync);
        }

        console.log('\n--- DIAGNOSTIC COMPLETE ---');
        console.log('Jika tidak ada error di atas, cek Winbox > Tools > Netwatch.');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERROR DURING DIAGNOSTIC:', err);
        process.exit(1);
    }
}

runDiag();
