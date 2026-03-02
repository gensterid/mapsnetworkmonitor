const { Client } = require('pg');
const fs = require('fs');

async function main() {
    let log = '--- Check Topology Columns ---\n';
    const connectionString = 'postgresql://postgres:admin123@127.0.0.1:5432/mikrotik_monitor';

    const client = new Client({
        connectionString: connectionString
    });

    try {
        await client.connect();
        log += 'Connected.\n';

        const tables = ['routers', 'router_netwatch', 'olts'];
        for (const table of tables) {
            log += `\nChecking table: ${table}\n`;
            const res = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '${table}'
                AND column_name IN ('parent_interface', 'topology_x', 'topology_y')
            `);
            if (res.rowCount > 0) {
                log += 'Found columns:\n' + JSON.stringify(res.rows, null, 2) + '\n';
            } else {
                log += 'No topology columns found.\n';
            }
        }
    } catch (err) {
        log += '❌ Failed: ' + err.message + '\n';
    } finally {
        await client.end();
        fs.writeFileSync('topology_check.txt', log, 'utf8');
        console.log('Check finished, see topology_check.txt');
    }
}

main();
