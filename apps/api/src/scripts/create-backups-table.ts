import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Creating genieacs_backups table and associated enum...');
    try {
        // 1. Create Enum if not exists
        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE genieacs_backup_type AS ENUM ('snapshot', 'template');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // 2. Create Table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS "genieacs_backups" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "onu_id" uuid REFERENCES "onus"("id") ON DELETE CASCADE,
                "sn" text NOT NULL,
                "vendor" text NOT NULL,
                "model" text NOT NULL,
                "name" text NOT NULL,
                "type" "genieacs_backup_type" NOT NULL DEFAULT 'snapshot',
                "config" jsonb NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            );
        `);
        
        console.log('genieacs_backups table created successfully.');
    } catch (error) {
        console.error('Failed to create table:', error);
    }
    process.exit(0);
}

main();
