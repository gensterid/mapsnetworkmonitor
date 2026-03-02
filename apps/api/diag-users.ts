import 'dotenv/config';
import { db } from './src/db/index.js';
import { users } from './src/db/schema/index.js';

async function main() {
    console.log('--- Database User Diagnostic ---');
    try {
        const allUsers = await db.select().from(users);
        console.log(`Total users found: ${allUsers.length}`);

        if (allUsers.length > 0) {
            console.table(allUsers.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role
            })));
        } else {
            console.log('No users found in the database table "users".');
        }
    } catch (error) {
        console.error('Error querying database:', error);
    }
    process.exit(0);
}

main();
