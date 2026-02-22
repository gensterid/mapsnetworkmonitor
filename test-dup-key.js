// test-drizzle-conflict.js
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'apps', 'api', '.env') });

const sql = postgres(process.env.DATABASE_URL);
const db = drizzle(sql);

async function main() {
    console.log('Testing raw Drizzle ON CONFLICT DO UPDATE...');
    try {
        const res = await sql`
        INSERT INTO "onus" ("id", "sn", "olt_id", "status") 
        VALUES (gen_random_uuid(), 'TEST_DUP_SN_123', '8c2ac0a3-9517-4157-8da5-9b77277dbda5', 'online')
        ON CONFLICT ("sn") DO UPDATE SET "updated_at" = now()
        RETURNING "id"
    `;
        console.log('Insert 1 succeeded:', res);

        const res2 = await sql`
        INSERT INTO "onus" ("id", "sn", "olt_id", "status") 
        VALUES (gen_random_uuid(), 'TEST_DUP_SN_123', '8c2ac0a3-9517-4157-8da5-9b77277dbda5', 'offline')
        ON CONFLICT ("sn") DO UPDATE SET "updated_at" = now()
        RETURNING "id"
    `;
        console.log('Insert 2 (UPSERT) succeeded:', res2);

    } catch (err) {
        console.error('ERROR CAUGHT!');
        console.error(err);
    } finally {
        await sql.end();
    }
}
main();
