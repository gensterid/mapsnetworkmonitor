import 'dotenv/config';
import postgres from 'postgres';

async function check() {
    console.log('--- DB CONNECTION CHECK ---');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);

    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not defined in .env');
        process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL, {
        connect_timeout: 5,
    });

    try {
        const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch';
        `;

        console.log('Columns in router_netwatch:');
        columns.forEach(col => {
            console.log(` - ${col.column_name} (${col.data_type})`);
        });

        const hasCol = columns.some(c => c.column_name === 'is_app_only');
        console.log('\n--- VERDICT ---');
        console.log('is_app_only exists in metadata:', hasCol);

        if (hasCol) {
            console.log('Attempting direct SELECT...');
            try {
                const testQuery = await sql`SELECT is_app_only FROM router_netwatch LIMIT 1`;
                console.log('SELECT result:', testQuery);
                console.log('✅ Column is accessible!');
            } catch (selectErr) {
                console.error('❌ SELECT failed even though column is in metadata:', selectErr.message);
            }
        }

    } catch (err) {
        console.error('Check failed with error:', err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        await sql.end();
        process.exit(0);
    }
}

check();
