
import 'dotenv/config';
import { Client } from 'pg';

async function checkColumns() {
    console.log('Script started');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('DATABASE_URL is not defined');
        process.exit(1);
    }

    try {
        const url = new URL(dbUrl);
        console.log(`Connecting to: ${url.host}${url.pathname} as ${url.username}`);
    } catch (e) {
        console.log('Could not parse DATABASE_URL for logging');
    }

    const client = new Client({
        connectionString: dbUrl,
    });

    try {
        await client.connect();
        console.log('Connected successfully.');

        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'routers';
        `);

        console.log('Columns in "routers" table:');
        console.table(res.rows);

        const snmpCommunity = res.rows.find(r => r.column_name === 'snmp_community');
        if (!snmpCommunity) {
            console.log('❌ Column "snmp_community" is MISSING!');

            console.log('Attempting to add missing columns...');
            await client.query(`
                ALTER TABLE routers 
                ADD COLUMN IF NOT EXISTS snmp_community text DEFAULT 'public',
                ADD COLUMN IF NOT EXISTS snmp_port integer DEFAULT 161;
            `);
            console.log('✅ Columns added successfully.');
        } else {
            console.log('✅ Column "snmp_community" exists.');
        }

    } catch (err: any) {
        console.error('Error querying database:', err);
        console.error(err.stack);
    } finally {
        await client.end();
    }
}

checkColumns().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
