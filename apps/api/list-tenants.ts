import 'dotenv/config';
import { db } from './src/db/index.js';
import { tenants } from './src/db/schema/tenants.js';
import { logger } from './src/lib/logger.js';

async function listTenants() {
    try {
        const result = await db.select().from(tenants);
        console.log('--- TENANTS ---');
        console.table(result);
        process.exit(0);
    } catch (err: any) {
        console.error('Failed to list tenants:', err.message);
        process.exit(1);
    }
}

listTenants();
