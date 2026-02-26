import { db } from './src/db/index.js';
import { users } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';

async function promoteAdmin() {
    try {
        console.log('Promoting admins to superadmin...');
        const result = await db.update(users)
            .set({ role: 'superadmin' })
            .where(eq(users.role, 'admin'))
            .returning();

        console.log(`Successfully promoted ${result.length} user(s) to superadmin.`);
        process.exit(0);
    } catch (error) {
        console.error('Error promoting users:', error);
        process.exit(1);
    }
}

promoteAdmin();
