import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function check() {
    console.log('--- TENANTS ---');
    const tenants = await db.execute(sql`SELECT id, name, slug FROM tenants`);
    console.table(tenants);

    console.log('--- USERS ---');
    const users = await db.execute(sql`SELECT id, email, username, tenant_id FROM users`);
    console.table(users);

    const accounts = await db.execute(sql`SELECT id, user_id, account_id, provider_id FROM accounts`);
    console.log('--- ACCOUNTS ---');
    console.table(accounts);

    process.exit(0);
}

check();
