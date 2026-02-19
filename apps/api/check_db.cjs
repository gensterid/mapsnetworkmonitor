const { Client } = require('pg');
const fs = require('fs');

async function main() {
    let log = '--- Check MAC Address Data ---\n';
    const connectionString = 'postgresql://postgres:admin123@127.0.0.1:5432/mikrotik_monitor';

    const client = new Client({
        connectionString: connectionString
    });

    try {
        await client.connect();
        log += 'Connected.\n';
        const res = await client.query('SELECT sn, name, mac_address FROM onus WHERE mac_address IS NOT NULL LIMIT 10');
        log += 'Records with MAC: ' + res.rowCount + '\n';
        if (res.rowCount > 0) {
            log += 'Sample Data:\n' + JSON.stringify(res.rows, null, 2) + '\n';
        } else {
            log += 'No records found with mac_address populated.\n';
            const all = await client.query('SELECT sn, name, mac_address FROM onus LIMIT 5');
            log += 'First 5 generic records:\n' + JSON.stringify(all.rows, null, 2) + '\n';
        }
    } catch (err) {
        log += '❌ Failed: ' + err.message + '\n';
    } finally {
        await client.end();
        fs.writeFileSync('db_check.txt', log, 'utf8');
    }
}

main();
