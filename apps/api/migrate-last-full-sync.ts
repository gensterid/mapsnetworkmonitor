import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        console.log('Adding last_full_sync column to routers table...');
        await db.execute(sql`ALTER TABLE routers ADD COLUMN IF NOT EXISTS last_full_sync TIMESTAMP;`);
        console.log('Success!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

main();
