import 'dotenv/config';
import { db } from '../db';
import { routerNetwatch } from '../db/schema';
import { eq } from 'drizzle-orm';

async function checkNetwatch() {
    console.log('--- Checking Netwatch Data ---');
    const router = await db.query.routers.findFirst({
        where: (routers, { like }) => like(routers.name, '%genster%')
    });

    if (!router) {
        console.log('Router not found');
        return;
    }

    const entries = await db.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, router.id));

    console.log(`Router: ${router.name} (${router.id})`);
    console.log(`Total entries: ${entries.length}`);

    entries.forEach(e => {
        console.log(`[${e.host}] Status: ${e.status} | Latency: ${e.latency}ms | Loss: ${e.packetLoss}% | Updated: ${e.lastCheck ? e.lastCheck.toISOString() : 'Never'}`);
    });
}

checkNetwatch().catch(console.error).finally(() => process.exit());
