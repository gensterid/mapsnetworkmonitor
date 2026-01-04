import 'dotenv/config';
import postgres from 'postgres';

async function checkUsers() {
    const sql = postgres(process.env.DATABASE_URL!);

    try {
        console.log('Checking users in database...');

        const users = await sql`
            SELECT id, email, name, role, "createdAt"
            FROM "user"
            ORDER BY "createdAt";
        `;

        console.log('Users found:', users.length);
        users.forEach(u => console.log(` - Email: ${u.email}, Name: ${u.name}, Role: ${u.role}`));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }

    process.exit(0);
}

checkUsers();
