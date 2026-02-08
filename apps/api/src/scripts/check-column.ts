
import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);

async function check() {
    try {
        const result = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch' AND column_name = 'target_interface';
        `;
        console.log('Column check result:', result);
    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await sql.end();
    }
}

check();
