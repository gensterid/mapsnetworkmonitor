
import 'dotenv/config';
import * as fs from 'fs';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);

async function main() {
    try {
        fs.writeFileSync('migration_traffic.log', 'Starting traffic column migration...\n');

        await sql`ALTER TABLE router_netwatch ADD COLUMN IF NOT EXISTS tx_rate bigint DEFAULT 0;`;
        await sql`ALTER TABLE router_netwatch ADD COLUMN IF NOT EXISTS rx_rate bigint DEFAULT 0;`;

        fs.appendFileSync('migration_traffic.log', 'Traffic columns added successfully.\n');
        console.log('Traffic columns added successfully.');
    } catch (error) {
        fs.appendFileSync('migration_traffic.log', `Failed: ${error}\n`);
        console.error('Failed:', error);
    } finally {
        await sql.end();
    }
}

main();
