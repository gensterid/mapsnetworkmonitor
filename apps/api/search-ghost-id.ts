import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

const TARGET_ID = '18325b2a-e507-42ae-b3d9-a87b91a01d4b';

async function main() {
    console.log(`Searching for ghost ID: ${TARGET_ID} in all promising columns...`);

    const tables = [
        'routers',
        'router_netwatch',
        'netwatch_hosts',
        'olts',
        'onus',
        'alerts'
    ];

    for (const table of tables) {
        try {
            // Check if table exists
            const tableExists = await db.execute(sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = ${table})`);
            if (!tableExists[0].exists) {
                console.log(`Table ${table} does not exist, skipping.`);
                continue;
            }

            // Get columns for table
            const columnsResult = await db.execute(sql`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = ${table} 
                AND data_type = 'uuid'
            `);
            const columns = columnsResult.map(c => c.column_name);

            if (columns.length === 0) continue;

            for (const col of columns) {
                try {
                    const query = sql.raw(`SELECT count(*) as count FROM "${table}" WHERE "${col}" = '${TARGET_ID}'`);
                    const result = await db.execute(query);
                    const count = parseInt(result[0].count);
                    if (count > 0) {
                        console.log(`!!! MATCH FOUND in ${table}.${col}: ${count} rows`);
                        const rows = await db.execute(sql.raw(`SELECT * FROM "${table}" WHERE "${col}" = '${TARGET_ID}' LIMIT 5`));
                        console.log(JSON.stringify(rows, null, 2));
                    }
                } catch (e) {
                    // Column might not exist or other error
                }
            }
        } catch (e) {
            console.error(`Error checking table ${table}:`, e.message);
        }
    }

    console.log('Search complete.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
