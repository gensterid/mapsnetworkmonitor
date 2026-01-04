import 'dotenv/config';
import { db } from '../db/index.js';
import { users, accounts } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { scryptSync, randomBytes, randomUUID } from 'crypto';

async function createAdminUser() {
    const email = 'admin@mikrotik.local';
    const password = 'admin123';
    const name = 'Administrator';

    console.log('Creating default admin user...');
    console.log('Email:', email);
    console.log('Password:', password);

    try {
        // Check if user already exists
        const existing = await db.select().from(users).where(
            eq(users.email, email)
        );

        if (existing.length > 0) {
            console.log('Admin user already exists!');
            console.log('Deleting existing admin to recreate with correct password...');

            // Delete existing account and user
            await db.delete(accounts).where(eq(accounts.userId, existing[0].id));
            await db.delete(users).where(eq(users.id, existing[0].id));
            console.log('Deleted existing admin user.');
        }

        // Hash password using scrypt (same format as Better Auth)
        // Format: salt:hash (both hex encoded)
        const salt = randomBytes(16).toString('hex');
        const hashedBuffer = scryptSync(password, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
        const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

        const now = new Date();
        const userId = randomUUID();

        // Insert user
        const [newUser] = await db.insert(users).values({
            id: userId,
            email,
            name,
            role: 'admin',
            emailVerified: true,
            createdAt: now,
            updatedAt: now
        }).returning();

        // Insert account (password) - Better Auth format
        await db.insert(accounts).values({
            id: randomUUID(),
            userId: newUser.id,
            accountId: newUser.id,
            providerId: 'credential',
            password: hashedPassword,
            createdAt: now,
            updatedAt: now
        });

        console.log('✅ Admin user created successfully!');
        console.log('');
        console.log('Login credentials:');
        console.log(`  Email: ${email}`);
        console.log(`  Password: ${password}`);

    } catch (error) {
        console.error('Error creating admin user:', error);
    }

    process.exit(0);
}

createAdminUser();

