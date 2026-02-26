import 'dotenv/config';
import { db } from './src/db/index.js';
import { users, tenants } from './src/db/schema/index.js';
import { eq, isNull } from 'drizzle-orm';

async function main() {
    console.log('--- RECOVERING ORPHAN USERS ---');

    try {
        // Find orphans
        const orphans = await db.select().from(users).where(isNull(users.tenantId));

        if (orphans.length === 0) {
            console.log('No orphan users found.');
            process.exit(0);
        }

        console.log(`Found ${orphans.length} orphan users.`);

        // Get the first tenant to use as default
        const [defaultTenant] = await db.select().from(tenants).limit(1);

        if (!defaultTenant) {
            console.error('Error: No tenants found in database. Cannot assign users.');
            process.exit(1);
        }

        console.log(`Assigning orphan users to tenant: ${defaultTenant.name} (${defaultTenant.id})`);

        for (const orphan of orphans) {
            console.log(`Fixing user: ${orphan.email} (${orphan.name})`);
            await db
                .update(users)
                .set({ tenantId: defaultTenant.id, updatedAt: new Date() })
                .where(eq(users.id, orphan.id));
        }

        console.log('\nRecovery complete successfully.');

    } catch (error) {
        console.error('Error during recovery:', error);
    }

    process.exit(0);
}

main();
