import postgres from 'postgres';
const sql = postgres('postgresql://postgres:admin123@localhost:5432/mikrotik_monitor');
async function test() {
    try {
        await sql`SELECT 1`;
        console.log('✅ Success: Connected to Database');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error: Could not connect to Database');
        console.error(err.message);
        process.exit(1);
    }
}
test();
