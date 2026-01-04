import { db } from '../db';
import { sql } from 'drizzle-orm';

async function addEscalationColumns() {
    try {
        console.log('Adding escalation columns to alerts table...');

        // Add escalation_level column if not exists
        await db.execute(sql`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'alerts' AND column_name = 'escalation_level'
                ) THEN
                    ALTER TABLE alerts ADD COLUMN escalation_level INTEGER DEFAULT 0 NOT NULL;
                END IF;
            END $$;
        `);
        console.log('✅ escalation_level column added or already exists');

        // Add last_escalated_at column if not exists
        await db.execute(sql`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'alerts' AND column_name = 'last_escalated_at'
                ) THEN
                    ALTER TABLE alerts ADD COLUMN last_escalated_at TIMESTAMP;
                END IF;
            END $$;
        `);
        console.log('✅ last_escalated_at column added or already exists');

        console.log('Migration complete!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

addEscalationColumns();
