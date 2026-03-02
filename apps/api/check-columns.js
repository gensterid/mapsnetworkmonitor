const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function check() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'topology_links';
        `);
        console.log('Columns in topology_links:', res.rows.map(r => r.column_name).join(', '));
    } catch (err) {
        console.error('Error checking columns:', err);
    } finally {
        await client.end();
    }
}

check();
