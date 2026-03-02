const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function check() {
    console.log('Connecting to:', process.env.DATABASE_URL);
    try {
        const users = await sql`SELECT id, email, name, role FROM users`;
        console.log('Users found:', users.length);
        console.log(JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Database error:', err);
    } finally {
        await sql.end();
    }
}

check();
