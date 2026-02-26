import 'dotenv/config';
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!);
    try {
        console.log('Adding columns to "alerts" table...');

        // 1. Add tenant_id (allow null initially to avoid breaking existing data)
        await sql`
            ALTER TABLE alerts ADD COLUMN IF NOT EXISTS tenant_id UUID;
        `;

        // 2. Add ai_analysis
        await sql`
            ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
        `;

        console.log('Columns added successfully.');
    } finally {
        await sql.end();
    }
}

main().catch(console.error);
