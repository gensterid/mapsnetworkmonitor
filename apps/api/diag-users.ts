import 'dotenv/config';
import { db } from './src/db/index.js';
import { users } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';

async function main() {
    const email = 'zul@mikrotik.local';
    console.log(`Checking for user with email: ${email}`);

    try {
        const result = await db.select().from(users).where(eq(users.email, email));

        if (result.length === 0) {
            console.log('No user found with that email.');
        } else {
            console.log('User found:');
            console.table(result.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                tenantId: u.tenantId
            })));
        }

        // Also list ALL users just in case
        console.log('\nAll users in database:');
        const allUsers = await db.select().from(users);
        console.table(allUsers.map(u => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            tenantId: u.tenantId
        })));

    } catch (error) {
        console.error('Error querying database:', error);
    }

    process.exit(0);
}

main();
