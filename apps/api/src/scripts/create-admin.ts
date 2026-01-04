import 'dotenv/config';
import { db } from '../db';
import { users } from '../db/schema';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

// Create a temporary auth instance for password hashing
const tempAuth = betterAuth({
    database: drizzleAdapter(db, {
        provider: 'pg',
    }),
    emailAndPassword: {
        enabled: true,
    },
});

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
            require('drizzle-orm').eq(users.email, email)
        );

        if (existing.length > 0) {
            console.log('Admin user already exists!');
            console.log('Use these credentials to login:');
            console.log(`  Email: ${email}`);
            console.log(`  Password: ${password}`);
            process.exit(0);
        }

        // Hash the password using bcrypt (same as better-auth)
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user directly
        const [newUser] = await db.insert(users).values({
            email,
            name,
            role: 'admin',
            emailVerified: true,
        }).returning();

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
