import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function diag() {
    console.log('🔍 DEEP AUTH DIAGNOSTIC');
    console.log('=======================');

    const users = await db.execute(sql`SELECT id, email, username, tenant_id FROM users`) as any[];
    console.log(`\nFound ${users.length} users:`);

    for (const user of users) {
        console.log(`\n👤 User: ${user.email}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Tenant ID: ${user.tenant_id}`);

        // Debug hidden chars in email
        const emailHex = Buffer.from(user.email).toString('hex');
        console.log(`   Email Hex: ${emailHex}`);

        const accounts = await db.execute(sql`
            SELECT id, provider_id, account_id 
            FROM accounts 
            WHERE user_id = ${user.id}
        `) as any[];

        if (accounts.length === 0) {
            console.log('   🛑 NO ACCOUNTS FOUND FOR THIS USER');
        } else {
            for (const acc of accounts) {
                console.log(`   🔑 Account: [${acc.provider_id}] -> ${acc.account_id}`);
                if (acc.provider_id === 'credential' && acc.account_id !== user.email) {
                    console.log(`      ⚠️ MISMATCH: account_id (${acc.account_id}) != user email (${user.email})`);
                }
            }
        }
    }

    console.log('\n--- SYSTEM CONFIG CHECK ---');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('PORT:', process.env.PORT);
    console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
    console.log('BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL);

    process.exit(0);
}

diag();
