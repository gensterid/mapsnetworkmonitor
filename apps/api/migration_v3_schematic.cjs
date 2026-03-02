const { Client } = require('pg');
const fs = require('fs');

async function main() {
    let log = '--- Migration: Custom Topology Schematic Tables ---\n';
    const connectionString = 'postgresql://postgres:admin123@127.0.0.1:5432/mikrotik_monitor';

    const client = new Client({
        connectionString: connectionString
    });

    try {
        await client.connect();
        log += 'Connected.\n';

        const queries = [
            `CREATE TABLE IF NOT EXISTS topology_nodes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
                node_id UUID NOT NULL,
                node_type TEXT NOT NULL,
                x DECIMAL(10, 2) NOT NULL DEFAULT 0,
                y DECIMAL(10, 2) NOT NULL DEFAULT 0,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )`,
            `CREATE TABLE IF NOT EXISTS topology_links (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
                source_node_id UUID NOT NULL,
                target_node_id UUID NOT NULL,
                source_interface TEXT,
                target_interface TEXT,
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )`,
            `CREATE INDEX IF NOT EXISTS topology_nodes_router_id_idx ON topology_nodes(router_id)`,
            `CREATE INDEX IF NOT EXISTS topology_nodes_node_id_idx ON topology_nodes(node_id)`,
            `CREATE INDEX IF NOT EXISTS topology_links_router_id_idx ON topology_links(router_id)`,
            `CREATE INDEX IF NOT EXISTS topology_links_source_idx ON topology_links(source_node_id)`,
            `CREATE INDEX IF NOT EXISTS topology_links_target_idx ON topology_links(target_node_id)`
        ];

        for (const query of queries) {
            log += `Running: ${query.substring(0, 50)}...\n`;
            await client.query(query);
            log += 'Result: Success\n';
        }

        log += '✅ Migration completed successfully.\n';
    } catch (err) {
        log += '❌ Migration failed: ' + err.message + '\n';
        console.error(err);
    } finally {
        await client.end();
        fs.writeFileSync('migration_schematic_log.txt', log, 'utf8');
        console.log('Migration finished, see migration_schematic_log.txt');
    }
}

main();
