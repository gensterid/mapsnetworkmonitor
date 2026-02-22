import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './apps/api/src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import path from 'path';

// Fix required for local execution mimicking Proxmox
dotenv.config({ path: path.join(process.cwd(), 'apps', 'api', '.env') });

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function main() {
    console.log('Testing Edge Case...');
    const oltId = '8c2ac0a3-9517-4157-8da5-9b77277dbda5';

    try {
        // 1. Manually insert an ONU with NULL oltId (like GenieACS would)
        await db.insert(schema.onus).values({
            sn: 'ZTEGCE7DC9F5_TEST',
            status: 'online',
            discoverySources: ['acs']
        }).onConflictDoNothing();

        // 2. Try the exact Drizzle code from olt.service.ts
        const [inserted] = await db.insert(schema.onus).values({
            sn: 'ZTEGCE7DC9F5_TEST',
            oltId: oltId,
            routerId: null,
            status: 'online'
        }).onConflictDoUpdate({
            target: schema.onus.sn,
            set: {
                oltId: oltId,
                status: 'online',
                updatedAt: new Date(),
            }
        }).returning();

        console.log('Success! Upsert worked:', inserted.id);

        // cleanup
        await db.delete(schema.onus).where(eq(schema.onus.sn, 'ZTEGCE7DC9F5_TEST'));

    } catch (err: any) {
        console.error('FAILED!');
        console.error(err);
    } finally {
        await sql.end();
        process.exit(0);
    }
}

main();
