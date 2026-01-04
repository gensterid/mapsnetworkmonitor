import 'dotenv/config';
import { db } from '../db';
import { users, accounts } from '../db/schema';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

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
            console.log('Use these credentials to login:');
            console.log(`  Email: ${email}`);
            console.log(`  Password: ${password}`);
            process.exit(0);
        }

        // Create auth instance to get proper password hashing config if needed, 
        // but for now we'll manually hash using the same method usually used (bcrypt)
        const hashedPassword = await bcrypt.hash(password, 10);

        const now = new Date();

        // Insert user
        const [newUser] = await db.insert(users).values({
            email,
            name,
            role: 'admin',
            emailVerified: true,
            createdAt: now,
            updatedAt: now
        }).returning();

        // Insert account (password)
        await db.insert(accounts).values({
            userId: newUser.id,
            accountId: email,
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
        console.log('');
        console.log('Note: Go to http://localhost:5173/login to login');

    } catch (error) {
        console.error('Error creating admin user:', error);
    }

    process.exit(0);
}

createAdminUser();
