import 'dotenv/config';
import postgres from 'postgres';

async function checkInterfaces() {
    const sql = postgres(process.env.DATABASE_URL!);

    try {
        console.log('Checking interfaces with speed data...');

        const interfaces = await sql`
            SELECT id, router_id, name, speed, running, status
            FROM router_interfaces
            LIMIT 20;
        `;

        console.log('Interfaces found:', interfaces.length);
        interfaces.forEach(i => console.log(` - ${i.name}: speed=${i.speed}, running=${i.running}, status=${i.status}`));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }

    process.exit(0);
}

checkInterfaces();
