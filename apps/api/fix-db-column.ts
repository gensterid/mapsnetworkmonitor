import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function migrate() {
    try {
        console.log('Adding disabled column to router_netwatch...');
        await db.execute(sql`
            ALTER TABLE router_netwatch 
            ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false NOT NULL;
        `);
        console.log('Column added successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error adding column:', err);
        process.exit(1);
    }
}

migrate();
