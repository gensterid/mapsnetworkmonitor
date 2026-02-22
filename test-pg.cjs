// test-pg.cjs
const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'apps', 'api', '.env') });

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        console.log('Testing PG raw insert...');
        const oltId = '8c2ac0a3-9517-4157-8da5-9b77277dbda5';

        // 1. First insert
        await client.query(`
            INSERT INTO onus (sn, olt_id, status)
            VALUES ('DUP_TEST', $1, 'online')
            ON CONFLICT (sn) DO UPDATE SET updated_at = NOW()
        `, [oltId]);
        console.log('Insert 1 Done.');

        // 2. Second insert (immediately after)
        await client.query(`
            INSERT INTO onus (sn, olt_id, status)
            VALUES ('DUP_TEST', $1, 'online')
            ON CONFLICT (sn) DO UPDATE SET updated_at = NOW()
        `, [oltId]);
        console.log('Insert 2 (UPSERT) Done.');

        // Cleanup
        await client.query(`DELETE FROM onus WHERE sn = 'DUP_TEST'`);
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await client.end();
    }
}
main();
