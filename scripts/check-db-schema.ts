
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../apps/api/.env');
dotenv.config({ path: envPath });

async function main() {
    const sql = postgres(process.env.DATABASE_URL!);
    try {
        const columns = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch';
        `;
        console.log('Columns in router_netwatch:', columns.map(c => c.column_name));

        const hasLinkedOnuId = columns.some(c => c.column_name === 'linked_onu_id'); // Drizzle converts camelCase to snake_case usually? check schema
        console.log('Has linked_onu_id:', hasLinkedOnuId);

    } catch (e) {
        console.error(e);
    } finally {
        await sql.end();
    }
}
main();
