const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: 'postgresql://postgres:admin123@localhost:5432/mikrotik_monitor'
    });

    console.log('Connecting to database...');
    try {
        await client.connect();
        console.log('Connected.');
        await client.query('ALTER TABLE onus ADD COLUMN IF NOT EXISTS mac_address TEXT');
        console.log('✅ Column mac_address added successfully (or already exists).');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await client.end();
    }
}

main();
