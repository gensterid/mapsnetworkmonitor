import 'dotenv/config';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

async function checkAll() {
    console.log('📊 DATABASE CONTENT SUMMARY');
    console.log('==========================\n');

    const tables = [
        'tenants',
        'users',
        'accounts',
        'routers',
        'router_groups',
        'olts',
        'onus',
        'alerts',
        'app_settings',
        'pppoe_sessions'
    ];

    const results = [];

    for (const table of tables) {
        try {
            const [data] = await db.execute(sql.raw(`SELECT count(*) as count FROM ${table}`)) as any[];
            results.push({
                "Table Name": table,
                "Row Count": parseInt(data.count || '0')
            });
        } catch (err) {
            results.push({
                "Table Name": table,
                "Row Count": "❌ Error: " + (err as any).message.split('\n')[0]
            });
        }
    }

    console.table(results);

    // Check specific critical routers if they exist
    if (results.find(r => r["Table Name"] === 'routers' && typeof r["Row Count"] === 'number' && r["Row Count"] > 0)) {
        console.log('\n📡 Sample Routers:');
        const routers = await db.execute(sql`SELECT name, host, status FROM routers LIMIT 5`) as any[];
        console.table(routers);
    }

    process.exit(0);
}

checkAll().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
