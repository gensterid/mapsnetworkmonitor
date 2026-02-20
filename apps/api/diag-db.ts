import 'dotenv/config';
import postgres from 'postgres';

async function checkDatabase() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    console.log('🔍 Connecting to database...');
    const sql = postgres(url);

    try {
        // 1. Check connection
        const now = await sql`SELECT NOW()`;
        console.log('✅ Connection established at:', now[0].now);

        // 2. Check for required tables
        const tables = ['users', 'sessions', 'accounts', 'verifications'];
        console.log('\n📊 Checking for required tables:');

        for (const table of tables) {
            const result = await sql`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = ${table}
                );
            `;
            const exists = result[0].exists;
            console.log(`${exists ? '✅' : '❌'} Table "${table}": ${exists ? 'Found' : 'MISSING'}`);
        }

        // 3. If users table exists, check for admins
        const usersExist = (await sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')`)[0].exists;
        if (usersExist) {
            const userCount = await sql`SELECT COUNT(*) FROM users`;
            console.log(`\n👥 Total users: ${userCount[0].count}`);
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Database error:', err);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

checkDatabase();
