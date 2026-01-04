import 'dotenv/config';
import postgres from 'postgres';

async function checkTables() {
    const sql = postgres(process.env.DATABASE_URL!);

    try {
        console.log('Listing all tables in the database...');

        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `;

        console.log('Tables found:');
        tables.forEach(t => console.log(' -', t.table_name));

        console.log('\n\nChecking router_netwatch structure...');
        const columns = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch'
            ORDER BY ordinal_position;
        `;

        console.log('router_netwatch columns:');
        columns.forEach(c => console.log(` - ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

        console.log('\n\nSample data in router_netwatch:');
        const data = await sql`SELECT * FROM router_netwatch LIMIT 5`;
        console.log('Rows:', data.length);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }

    process.exit(0);
}

checkTables();
