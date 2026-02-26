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
    }

    // 2. Initial Setup (if database is empty or requested)
    if (userList.length === 0 || process.argv.includes('--init')) {
        console.log('\n🏗️  Initializing Database (Empty state detected or --init used)...');

        // Ensure we have a tenant
        const [existingTenant] = await db.execute(sql`SELECT id FROM tenants LIMIT 1`) as any[];
        let tenantId = existingTenant?.id;

        if (!tenantId) {
            console.log('🏢 Creating Default Tenant (Main ISP)...');
            const [newTenant] = await db.execute(sql`
                INSERT INTO tenants (name, slug, description)
                VALUES ('Main ISP', 'main-isp', 'Recovered Default Tenant')
                RETURNING id
            `) as any[];
            tenantId = newTenant.id;
            console.log(`✅ Tenant created: ${tenantId}`);
        } else {
            console.log(`🏢 Using existing tenant: ${tenantId}`);
        }

        // Create Default Admin
        const adminEmail = 'admin@admin.com';
        const adminName = 'System Administrator';
        const password = 'password123';

        console.log(`👤 Creating Super Admin (${adminEmail})...`);

        // Check if user exists
        const [existingAdmin] = await db.execute(sql`SELECT id FROM users WHERE email = ${adminEmail}`) as any[];
        let userId = existingAdmin?.id;

        if (!userId) {
            userId = crypto.randomUUID();
            await db.execute(sql`
                INSERT INTO users (id, email, name, role, tenant_id, email_verified, created_at, updated_at)
                VALUES (${userId}, ${adminEmail}, ${adminName}, 'admin', ${tenantId}, true, NOW(), NOW())
            `);
            console.log('✅ User record created.');
        } else {
            await db.execute(sql`UPDATE users SET tenant_id = ${tenantId} WHERE id = ${userId}`);
            console.log('✅ Existing user assigned to tenant.');
        }

        // Create Account (Password)
        const salt = crypto.randomBytes(16).toString('hex');
        const hashedBuffer = crypto.scryptSync(password, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
        const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

        await db.execute(sql`DELETE FROM accounts WHERE user_id = ${userId} AND provider_id = 'credential'`);
        await db.execute(sql`
            INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
            VALUES (${crypto.randomUUID()}, ${userId}, ${adminEmail}, 'credential', ${hashedPassword}, NOW(), NOW())
        `);

        console.log('\n✨ RECOVERY SUCCESSFUL!');
        console.log('-----------------------');
        console.log(`Email:    ${adminEmail}`);
        console.log(`Password: ${password}`);
        console.log('-----------------------');
        console.log('Please change your password immediately after login.\n');
        process.exit(0);
    }

    // 3. Fix account_id mismatch for existing users
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
    } catch (err: any) {
        console.error('❌ Failed to repair account_id:', err.message);
    }

    // 4. Ensure Default Admin exists and has a known password if requested
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

    // 5. Promote to Superadmin or Create Superadmin
    if (process.argv.includes('--superadmin')) {
        const email = process.argv.find(arg => arg.includes('@')) || 'admin@admin.com';
        console.log(`\n👑 Promoting/Creating Super Admin: ${email}...`);

        const [admin] = await db.execute(sql`SELECT id FROM users WHERE email = ${email}`) as any[];

        if (admin) {
            await db.execute(sql`UPDATE users SET role = 'superadmin' WHERE id = ${admin.id}`);
            console.log(`✅ User ${email} promoted to superadmin.`);
        } else {
            console.log(`👤 Creating new Super Admin (${email})...`);

            // Ensure we have a tenant
            const [existingTenant] = await db.execute(sql`SELECT id FROM tenants LIMIT 1`) as any[];
            let tenantId = existingTenant?.id;
            if (!tenantId) {
                const [newTenant] = await db.execute(sql`INSERT INTO tenants (name, slug) VALUES ('Main ISP', 'main-isp') RETURNING id`) as any[];
                tenantId = newTenant.id;
            }

            const userId = crypto.randomUUID();
            const password = 'password123';
            const salt = crypto.randomBytes(16).toString('hex');
            const hashedBuffer = crypto.scryptSync(password, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
            const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

            await db.execute(sql`
                INSERT INTO users (id, email, name, role, tenant_id, email_verified, created_at, updated_at)
                VALUES (${userId}, ${email}, 'Super Admin', 'superadmin', ${tenantId}, true, NOW(), NOW())
            `);

            await db.execute(sql`
                INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
                VALUES (${crypto.randomUUID()}, ${userId}, ${email}, 'credential', ${hashedPassword}, NOW(), NOW())
            `);

            console.log(`✅ Super Admin created: ${email} / password123`);
        }
    }

    console.log('\n🚀 Repair finished. Please try logging in again.');
    process.exit(0);
}

repair().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
