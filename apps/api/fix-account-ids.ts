import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function fix() {
    console.log('🔄 Syncing account_id with user email for credential provider...');

    // Update accounts table by joining with users table to get the email
    const result = await db.execute(sql`
        UPDATE accounts
        SET account_id = u.email
        FROM users u
        WHERE accounts.user_id = u.id 
        AND accounts.provider_id = 'credential'
    `);

    console.log('✅ Update complete.');

    // Verify
    const verify = await db.execute(sql`
        SELECT u.email, a.account_id 
        FROM accounts a 
        JOIN users u ON a.user_id = u.id 
        WHERE a.provider_id = 'credential'
    `);
    console.table(verify);

    process.exit(0);
}

fix();
