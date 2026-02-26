import { db } from './src/db/index.js';
import { tenants } from './src/db/schema/index.js';

async function main() {
    try {
        const allTenants = await db.select().from(tenants);
        console.log('--- Tenants ---');
        console.log(JSON.stringify(allTenants, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();
