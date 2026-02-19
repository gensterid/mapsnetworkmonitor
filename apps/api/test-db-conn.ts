import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

console.log('Testing connection to:', connectionString);

const sql = postgres(connectionString!, {
    connect_timeout: 5,
});

async function testConnection() {
    try {
        const result = await sql`SELECT version()`;
        console.log('Connected successfully!');
        console.log('PostgreSQL version:', result[0].version);
        process.exit(0);
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }
}

testConnection();
