import 'dotenv/config';
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!);
    try {
        const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'alerts'
            ORDER BY ordinal_position;
        `;
        console.log('Columns in "alerts" table:');
        columns.forEach(c => console.log(`- ${c.column_name}: ${c.data_type}`));
    } finally {
        await sql.end();
    }
}

main().catch(console.error);
