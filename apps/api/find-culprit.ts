import 'dotenv/config';
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { eq, and, or, not, sql } from 'drizzle-orm';

async function findCulprit() {
    const targetId = '944c427d-2f1e-4e7c-bde9-f89010163d01'; // ID Yani

    try {
        const [target] = await db.select().from(routers).where(eq(routers.id, targetId));
        if (!target) {
            console.error('Target router not found');
            process.exit(1);
        }

        const normalizeHost = (h: string) => h.split(':')[0].trim().toLowerCase();
        const targetHostBase = normalizeHost(target.host);

        console.log(`🔎 Searching for routers colliding with: ${target.name} (Base Host: ${targetHostBase})`);

        const allWantsWebhook = await db.select().from(routers).where(eq(routers.useWebhook, true));

        const colliding = allWantsWebhook.filter(r => {
            if (r.id === targetId) return false;

            // 1. Hardware Identity Match (Strongest)
            if (target.serialNumber && r.serialNumber === target.serialNumber) return true;
            if (target.identity && r.identity === target.identity) return true;

            // 2. Base Host Match (Ignoring Ports)
            if (normalizeHost(r.host) === targetHostBase) return true;

            return false;
        });

        if (colliding.length === 0) {
            console.log('✅ No colliding routers found with useWebhook: true');
        } else {
            console.log(`⚠️ Found ${colliding.length} colliding router(s):`);
            colliding.forEach((r, i) => {
                console.log(`${i + 1}. Nama: ${r.name}, Host: ${r.host}, Port: ${r.port}, Webhook: ${r.useWebhook}`);
            });
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findCulprit();
