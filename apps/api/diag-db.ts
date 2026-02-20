import 'dotenv/config';
import postgres from 'postgres';

async function checkDatabase() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    console.log('🔍 Connecting to database for deep inspection...');
    const sql = postgres(url);

    try {
        // 1. Check for required tables
        const tables = ['users', 'sessions', 'accounts', 'verifications'];
        console.log('\n📊 Checking tables and columns:');

        for (const table of tables) {
            const tableResult = await sql`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = ${table}
                );
            `;
            const exists = tableResult[0].exists;

            if (!exists) {
                console.log(`❌ Table "${table}": MISSING`);
                continue;
            }

            // Check columns
            const cols = await sql`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = ${table}
            `;
            console.log(`✅ Table "${table}": Found (${cols.length} columns)`);

            // Critical column checks
            if (table === 'accounts') {
                const hasPassword = cols.some(c => c.column_name === 'password');
                console.log(`   - Column "password": ${hasPassword ? '✅ Found' : '❌ MISSING'}`);
            }
            if (table === 'users') {
                const hasRole = cols.some(c => c.column_name === 'role');
                const hasEmail = cols.some(c => c.column_name === 'email');
                console.log(`   - Column "email": ${hasEmail ? '✅ Found' : '❌ MISSING'}`);
                console.log(`   - Column "role": ${hasRole ? '✅ Found' : '❌ MISSING'}`);
            }
        }

        // 2. Check users
        const users = await sql`SELECT id, email, role FROM users LIMIT 5`;
        console.log(`\n👥 Sample Users (Total: ${users.length}):`);
        users.forEach(u => console.log(`   - ${u.email} (${u.role})`));

        // 3. Check for auth failures in log (simulated check)
        console.log('\n🔐 Auth Environment Check:');
        console.log(`   - BETTER_AUTH_URL: ${process.env.BETTER_AUTH_URL || '❌ MISSING'}`);
        console.log(`   - CORS_ORIGIN: ${process.env.CORS_ORIGIN || '❌ MISSING'}`);
        console.log(`   - TRUSTED_ORIGINS: ${process.env.TRUSTED_ORIGINS || '❌ MISSING'}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Database error:', err);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

checkDatabase();
