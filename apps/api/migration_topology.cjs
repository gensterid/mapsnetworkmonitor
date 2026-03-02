const { Client } = require('pg');
const fs = require('fs');

async function main() {
    let log = '--- Migration: Topology Columns ---\n';
    const connectionString = 'postgresql://postgres:admin123@127.0.0.1:5432/mikrotik_monitor';

    const client = new Client({
        connectionString: connectionString
    });

    try {
        await client.connect();
        log += 'Connected.\n';

        const queries = [
            'ALTER TABLE routers ADD COLUMN IF NOT EXISTS parent_interface TEXT',
            'ALTER TABLE routers ADD COLUMN IF NOT EXISTS topology_x DECIMAL(10, 2)',
            'ALTER TABLE routers ADD COLUMN IF NOT EXISTS topology_y DECIMAL(10, 2)',
            'ALTER TABLE router_netwatch ADD COLUMN IF NOT EXISTS topology_x DECIMAL(10, 2)',
            'ALTER TABLE router_netwatch ADD COLUMN IF NOT EXISTS topology_y DECIMAL(10, 2)',
            'ALTER TABLE olts ADD COLUMN IF NOT EXISTS topology_x DECIMAL(10, 2)',
            'ALTER TABLE olts ADD COLUMN IF NOT EXISTS topology_y DECIMAL(10, 2)'
        ];

        for (const query of queries) {
            log += `Running: ${query}\n`;
            const res = await client.query(query);
            log += 'Result: Success\n';
        }

        log += '✅ Migration completed successfully.\n';
    } catch (err) {
        log += '❌ Migration failed: ' + err.message + '\n';
        console.error(err);
    } finally {
        await client.end();
        fs.writeFileSync('migration_topology_log.txt', log, 'utf8');
        console.log('Migration finished, see migration_topology_log.txt');
    }
}

main();
