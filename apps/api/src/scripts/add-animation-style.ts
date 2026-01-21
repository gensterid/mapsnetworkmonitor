import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

async function addAnimationStyleColumn() {
    try {
        console.log('Adding animation_style column to users table...');

        await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS animation_style text DEFAULT 'default'
    `);

        console.log('✅ animation_style column added successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

addAnimationStyleColumn();
