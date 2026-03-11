import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';

async function run() {
    try {
        const r = await db.query.routers.findFirst({
            where: eq(routers.id, 'c7f88705-f35c-478c-bf8d-2ffd16e8a831')
        });
        console.log('\n--- ROUTER INFO ---');
        console.log('HOST:', r?.host);
        console.log('PORT:', r?.port);
        console.log('-------------------\n');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
