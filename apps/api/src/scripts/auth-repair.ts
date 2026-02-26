import 'dotenv/config';
import { db } from '../db/index.js';
import { users, accounts } from '../db/schema/index.js';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

async function repair() {
    console.log('🔍 AUTH REPAIR UTILITY');
    console.log('=====================\n');

    // 1. List Users
    console.log('📋 Existing Users:');
    const userList = await db.execute(sql`SELECT id, email, username, role FROM users`) as any[];
    console.table(userList);

    if (userList.length === 0) {
        console.log('❌ No users found in database.');
        process.exit(0);
    }

    // 2. Fix account_id mismatch
    console.log('\n⚙️ Repairing account_id mismatch (Syncing with Email)...');
    try {
        const result = await db.execute(sql`
            UPDATE accounts
            SET account_id = u.email
            FROM users u
            WHERE accounts.user_id = u.id 
            AND accounts.provider_id = 'credential'
        `);
        console.log('✅ Updated credential accounts to use email as account_id.');
    } catch (err) {
        console.error('❌ Failed to repair account_id:', err.message);
    }

    // 3. Ensure Default Admin exists and has a known password if requested
    if (process.argv.includes('--reset-admin')) {
        const adminEmail = 'admin@admin.com';
        console.log(`\n🔑 Resetting password for ${adminEmail} to 'password123'...`);

        const [admin] = await db.execute(sql`SELECT id FROM users WHERE email = ${adminEmail}`) as any[];

        if (admin) {
            const salt = crypto.randomBytes(16).toString('hex');
            const hashedBuffer = crypto.scryptSync('password123', salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
            const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

            // Check if account exists
            const [acc] = await db.execute(sql`SELECT id FROM accounts WHERE user_id = ${admin.id} AND provider_id = 'credential'`) as any[];

            if (acc) {
                await db.execute(sql`UPDATE accounts SET password = ${hashedPassword}, account_id = ${adminEmail} WHERE id = ${acc.id}`);
            } else {
                await db.execute(sql`
                    INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
                    VALUES (${crypto.randomUUID()}, ${admin.id}, ${adminEmail}, 'credential', ${hashedPassword}, NOW(), NOW())
                `);
            }
            console.log('✅ Admin password has been reset to: password123');
        } else {
            console.log(`⚠️ User ${adminEmail} not found. Use 'npm run create-admin' to create a new one.`);
        }
    }

    console.log('\n🚀 Repair finished. Please try logging in again.');
    process.exit(0);
}

repair().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
