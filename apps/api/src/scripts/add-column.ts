
import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);

import * as fs from 'fs';

async function main() {
    try {
        fs.writeFileSync('migration.log', 'Starting migration...\n');

        await sql`ALTER TABLE router_netwatch ADD COLUMN IF NOT EXISTS target_interface text;`;

        fs.appendFileSync('migration.log', 'Column added successfully.\n');
    } catch (error) {
        fs.appendFileSync('migration.log', `Failed: ${error}\n`);
    } finally {
        await sql.end();
    }
}

main();
