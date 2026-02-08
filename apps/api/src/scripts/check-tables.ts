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


        console.log('\n\nChecking pppoe_sessions structure...');
        const pppoeCols = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'pppoe_sessions'
            ORDER BY ordinal_position;
        `;

        console.log('pppoe_sessions columns:');
        pppoeCols.forEach(c => console.log(` - ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

        console.log('\n\nSample data in pppoe_sessions:');
        const pppoeData = await sql`SELECT * FROM pppoe_sessions LIMIT 5`;
        console.log('Rows:', pppoeData.length);
        if (pppoeData.length > 0) {
            console.log('First row keys:', Object.keys(pppoeData[0]));
            // Check for lat/long types
            console.log('Sample lat/long:', pppoeData[0].latitude, typeof pppoeData[0].latitude, pppoeData[0].longitude, typeof pppoeData[0].longitude);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }

    process.exit(0);
}

checkTables();
