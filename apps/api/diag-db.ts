import 'dotenv/config';
import postgres from 'postgres';

async function checkDatabase() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    console.log('🔍 Connecting to database for FINAL inspection...');
    const sql = postgres(url);

    try {
        const tables = ['users', 'sessions', 'accounts', 'verifications', 'onus'];
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

            const cols = await sql`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = ${table}
            `;
            console.log(`✅ Table "${table}": Found (${cols.length} columns)`);

            if (table === 'users') {
                ['email', 'username', 'role', 'name', 'ai_enabled', 'ai_api_key'].forEach(colName => {
                    const hasCol = cols.some(c => c.column_name === colName);
                    console.log(`   - Column "${colName}": ${hasCol ? '✅ Found' : '❌ MISSING'}`);
                });
            }
            if (table === 'accounts') {
                ['password', 'provider_id', 'account_id'].forEach(colName => {
                    const hasCol = cols.some(c => c.column_name === colName);
                    console.log(`   - Column "${colName}": ${hasCol ? '✅ Found' : '❌ MISSING'}`);
                });
            }
            if (table === 'onus') {
                ['sn', 'router_id', 'olt_id', 'host'].forEach(colName => {
                    const hasCol = cols.some(c => c.column_name === colName);
                    console.log(`   - Column "${colName}": ${hasCol ? '✅ Found' : '❌ MISSING'}`);
                });
            }
        }

        console.log('\n👥 User List (first 10):');
        const users = await sql`SELECT id, email, username, role, ai_enabled, ai_api_key FROM users LIMIT 10`;
        if (users.length === 0) {
            console.log('   ⚠️ NO USERS FOUND IN DATABASE');
        } else {
            users.forEach(u => {
                const maskKey = u.ai_api_key ? `${u.ai_api_key.substring(0, 8)}...` : '(null)';
                console.log(`   - Email: ${u.email} | Role: ${u.role} | AI: ${u.ai_enabled ? '✅' : '❌'} | Key: ${maskKey}`);
            });
        }

        console.log('\n🔐 Auth Config:');
        console.log(`   - BETTER_AUTH_URL: ${process.env.BETTER_AUTH_URL}`);
        console.log(`   - CORS_ORIGIN: ${process.env.CORS_ORIGIN}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Database error:', err);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

checkDatabase();
