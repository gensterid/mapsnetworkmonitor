
import 'dotenv/config';
import { auth } from './src/lib/auth';
import { db } from './src/db';
import { users, accounts } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function run() {
    const email = `test-${Date.now()}@example.com`;
    const password = 'password123';

    console.log(`Creating user ${email}...`);

    // Mock request context if needed, but the node adapter might handle it
    // We strive to use the internal API if possible, or just the handler
    try {
        const res = await auth.api.signUpEmail({
            body: {
                email,
                password,
                name: 'Test User'
            }
        });

        console.log('User created via API.');

        // Fetch from DB
        const user = await db.query.users.findFirst({
            where: eq(users.email, email)
        });

        if (user) {
            const account = await db.query.accounts.findFirst({
                where: eq(accounts.userId, user.id)
            });
            console.log('Account password hash:', account?.password);
        } else {
            console.log('User not found in DB?');
        }

    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

run();
