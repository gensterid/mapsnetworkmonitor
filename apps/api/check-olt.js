import 'dotenv/config';
import postgres from 'postgres';

async function check() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('DATABASE_URL not found');
        process.exit(1);
    }
    const sql = postgres(url);
    const id = '63bfb5eb-33bd-4622-a633-e90d2f7f754c';
    try {
        console.log(`Checking OLT ${id}...`);
        const rows = await sql`SELECT * FROM olts WHERE id = ${id}`;
        if (rows.length === 0) {
            console.log('OLT not found');
        } else {
            console.log('OLT Record:', JSON.stringify(rows[0], null, 2));
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
        process.exit(0);
    }
}

check();
