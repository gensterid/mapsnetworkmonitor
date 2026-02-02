
import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);

async function main() {
    console.log('Applying manual schema fix for pppoe_sessions...');
    try {
        await sql`ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active'`;
        console.log('Added column: status');

        await sql`ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "last_down" timestamp`;
        console.log('Added column: last_down');

        await sql`ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "last_latency" integer`;
        console.log('Added column: last_latency');

        console.log('Schema fix applied successfully.');
    } catch (error) {
        console.error('Failed to apply schema fix:', error);
    } finally {
        await sql.end();
    }
}

main();
