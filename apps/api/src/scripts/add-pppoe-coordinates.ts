import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

async function addPppoeCoordinates() {
    console.log('Adding latitude and longitude columns to pppoe_sessions table...');

    try {
        await db.execute(sql`
            ALTER TABLE pppoe_sessions 
            ADD COLUMN IF NOT EXISTS latitude TEXT,
            ADD COLUMN IF NOT EXISTS longitude TEXT
        `);
        console.log('Successfully added latitude and longitude columns!');
    } catch (e) {
        console.error('Error adding columns:', e);
    }

    process.exit(0);
}

addPppoeCoordinates();
