import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { onus } from './src/db/schema/onus.js';
import { eq } from 'drizzle-orm';

async function checkOnus() {
    const oltId = '63bfb5eb-33bd-4622-a633-e90d2f7f754c';
    const sql = postgres(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    try {
        const rows = await db.select().from(onus).where(eq(onus.oltId, oltId));
        console.log(`Total ONUs for Cdata01: ${rows.length}`);

        const withSignal = rows.filter(r => r.lastRxPower);
        console.log(`ONUs with signal: ${withSignal.length}`);

        if (withSignal.length > 0) {
            console.log('Sample signal data:');
            withSignal.slice(0, 5).forEach(r => {
                console.log(`${r.sn}: ${r.lastRxPower} (updated: ${r.updatedAt})`);
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        await sql.end();
    }
}

checkOnus();
