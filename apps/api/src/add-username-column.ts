import 'dotenv/config';
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';

async function migrate() {
    try {
        console.log('Adding username column to users table...');
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;`);
        console.log('✅ Username column added successfully!');

        // Also add unique constraint if it doesn't exist
        try {
            await db.execute(sql`ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);`);
            console.log('✅ Unique constraint added successfully!');
        } catch (e) {
            console.log('ℹ️ Unique constraint may already exist, continuing...');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
