const { Client } = require('pg');
const fs = require('fs');

async function main() {
    let log = '--- Migration Started ---\n';
    const connectionString = 'postgresql://postgres:admin123@127.0.0.1:5432/mikrotik_monitor';
    log += 'Connecting to: ' + connectionString + '\n';

    const client = new Client({
        connectionString: connectionString
    });

    try {
        await client.connect();
        log += 'Connected.\n';
        const res = await client.query('ALTER TABLE onus ADD COLUMN IF NOT EXISTS mac_address TEXT');
        log += 'Query Result: ' + JSON.stringify(res) + '\n';
        log += '✅ Success.\n';
    } catch (err) {
        log += '❌ Failed: ' + err.message + '\n';
        log += err.stack + '\n';
    } finally {
        await client.end();
        log += '--- Finished ---\n';
        fs.writeFileSync('migration_log.txt', log, 'utf8');
    }
}

main();
