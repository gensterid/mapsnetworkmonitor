import { db } from './src/db/index.js';
import { users, accounts } from './src/db/schema/index.js';
import { eq, notInArray, sql } from 'drizzle-orm';
import crypto from 'crypto';

async function fix() {
    console.log('🔍 Checking for users without accounts...');

    // Find users who don't have a 'credential' account
    const usersWithoutAccounts = await db.execute(sql`
        SELECT u.id, u.email FROM users u
        LEFT JOIN accounts a ON u.id = a.user_id AND a.provider_id = 'credential'
        WHERE a.id IS NULL
    `) as any[];

    if (usersWithoutAccounts.length === 0) {
        console.log('✅ All users have credential accounts.');
        process.exit(0);
    }

    console.log(`⚠️ Found ${usersWithoutAccounts.length} users without accounts. Fixing...`);

    // Default password 'password123' hashed (Salted Scrypt: same format as Better Auth)
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedBuffer = crypto.scryptSync('password123', salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
    const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

    for (const user of usersWithoutAccounts) {
        console.log(`✨ Creating account for ${user.email} (${user.id})...`);
        try {
            await db.insert(accounts).values({
                id: crypto.randomUUID(),
                userId: user.id,
                accountId: user.id,
                providerId: 'credential',
                password: hashedPassword,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            console.log(`✅ Success for ${user.email}`);
        } catch (err) {
            console.error(`❌ Failed for ${user.email}:`, err.message);
        }
    }

    console.log('\n🚀 Fix complete. Try logging in with:');
    console.log('User: admin@admin.com');
    console.log('Pass: password123');

    process.exit(0);
}

fix();
