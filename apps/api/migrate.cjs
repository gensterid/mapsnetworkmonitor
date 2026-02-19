const { Client } = require('pg');

async function main() {
    console.log('--- Migration Script Started ---');
    const connectionString = 'postgresql://postgres:admin123@127.0.0.1:5432/mikrotik_monitor';
    console.log('Connecting to:', connectionString);

    const client = new Client({
        connectionString: connectionString
    });

    try {
        await client.connect();
        console.log('Connected successfully.');
        const res = await client.query('ALTER TABLE onus ADD COLUMN IF NOT EXISTS mac_address TEXT');
        console.log('Query result:', JSON.stringify(res));
        console.log('✅ Column mac_address added successfully (or already exists).');
    } catch (err) {
        console.error('❌ Migration failed error details:');
        console.error(err);
    } finally {
        await client.end();
        console.log('--- Migration Script Finished ---');
    }
}

main().catch(err => {
    console.error('Fatal error in main:');
    console.error(err);
});
