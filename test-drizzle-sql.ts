import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { onus } from './apps/api/src/db/schema/onus.js';

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

function getSql() {
    const query = db.insert(onus).values({
        sn: 'TEST1234',
        oltId: '8c2ac0a3-9517-4157-8da5-9b77277dbda5',
        name: 'Test',
        status: 'unknown'
    }).onConflictDoUpdate({
        target: onus.sn,
        set: {
            name: 'UpdatedName'
        }
    }).toSQL();

    console.log('Drizzle SQL:');
    console.log(query.sql);
    console.log(query.params);
}

getSql();
process.exit(0);
