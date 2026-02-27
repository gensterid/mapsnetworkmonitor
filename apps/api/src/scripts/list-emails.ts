import 'dotenv/config';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';

async function listUsers() {
    console.log('👥 USER LIST');
    const allUsers = await db.select({ email: users.email, name: users.name, role: users.role }).from(users);
    console.table(allUsers);
    process.exit(0);
}

listUsers().catch(err => {
    console.error(err);
    process.exit(1);
});
