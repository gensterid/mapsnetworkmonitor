
import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function checkSchema() {
    try {
        const result = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'olts';
        `);
        // Drizzle might return array directly or object depending on driver
        console.log('Result structure:', JSON.stringify(result, null, 2));

        if (Array.isArray(result)) {
            console.log('Columns:', result.map((r: any) => r.column_name));
        } else if (result.rows) {
            console.log('Columns:', result.rows.map((r: any) => r.column_name));
        }
    } catch (error) {
        console.error('Error checking schema:', error);
    }
    process.exit(0);
}

checkSchema();
