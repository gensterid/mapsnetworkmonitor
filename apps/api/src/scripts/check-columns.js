
require('dotenv').config();
const { Client } = require('pg');

async function checkColumns() {
    console.log('Script started');
    console.log('DB URL defined:', !!process.env.DATABASE_URL);

    // Parse and log connection details (safe)
    try {
        const url = new URL(process.env.DATABASE_URL);
        console.log(`Connecting to: ${url.host}${url.pathname} as ${url.username}`);
    } catch (e) {
        console.log('Could not parse DATABASE_URL for logging');
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
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
            // Attempt to fix it directly
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

    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await client.end();
    }
}

checkColumns();
