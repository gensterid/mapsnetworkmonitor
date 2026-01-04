// Quick script to update user role to admin
import 'dotenv/config';
import { db } from './db/index.js';
import { users } from './db/schema/index.js';
import { eq } from 'drizzle-orm';

async function updateUserRole() {
    try {
        // Update all users with role='user' to role='admin' (for first time setup)
        const result = await db.update(users)
            .set({ role: 'admin' })
            .where(eq(users.role, 'user'))
            .returning({ email: users.email, role: users.role });

        console.log('Updated users:', result);
        process.exit(0);
    } catch (error) {
        console.error('Error updating user role:', error);
        process.exit(1);
    }
}

updateUserRole();
