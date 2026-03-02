import 'dotenv/config';
import postgres from 'postgres';

async function check() {
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    const sql = postgres(process.env.DATABASE_URL);
    try {
        const result = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch' AND column_name = 'is_app_only';
        `;
        console.log('Result for is_app_only check:', result);

        const allCols = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch';
        `;
        console.log('All columns:', allCols.map(c => c.column_name).sort());

    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        await sql.end();
    }
}

check();
