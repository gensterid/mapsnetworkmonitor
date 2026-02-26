import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function verify() {
    const [user] = await db.execute(sql`SELECT * FROM users LIMIT 1`) as any[];
    if (user) {
        console.log('User found:');
        console.log(JSON.stringify(user, null, 2));
    } else {
        console.log('No users found.');
    }
    process.exit(0);
}

verify();
