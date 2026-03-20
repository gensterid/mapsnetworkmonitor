import postgres from 'postgres';
import path from 'path';
import { config } from 'dotenv';

// Use same env loading as repair-db.ts
const envPath = path.resolve(process.cwd(), '.env');
config({ path: envPath });

const sql = postgres(process.env.DATABASE_URL!);

async function fix() {
    console.log('🚀 Running focused GenieACS DB fix...');
    
    try {
        // 1. Create Enum if missing
        console.log('Checking genieacs_backup_type enum...');
        const enumCheck = await sql`
            SELECT n.nspname as schema, t.typname as type 
            FROM pg_type t 
            LEFT JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace 
            WHERE t.typname = 'genieacs_backup_type';
        `;
        
        if (enumCheck.length === 0) {
            console.log('Creating genieacs_backup_type enum...');
            await sql`CREATE TYPE "public"."genieacs_backup_type" AS ENUM('snapshot', 'template');`;
        }

        // 2. Create Table if missing
        console.log('Checking genieacs_backups table...');
        const tableCheck = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'genieacs_backups';
        `;

        if (tableCheck.length === 0) {
            console.log('Creating genieacs_backups table...');
            await sql`
                CREATE TABLE "genieacs_backups" (
                    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                    "onu_id" uuid,
                    "sn" text NOT NULL,
                    "vendor" text NOT NULL,
                    "model" text NOT NULL,
                    "name" text NOT NULL,
                    "type" "genieacs_backup_type" DEFAULT 'snapshot' NOT NULL,
                    "config" jsonb NOT NULL,
                    "created_at" timestamp DEFAULT now() NOT NULL,
                    "updated_at" timestamp DEFAULT now() NOT NULL
                );
            `;
            
            // Add foreign key if onus table exists
            console.log('Adding foreign key to onuses...');
            await sql`
                ALTER TABLE "genieacs_backups" 
                ADD CONSTRAINT "genieacs_backups_onu_id_onus_id_fk" 
                FOREIGN KEY ("onu_id") REFERENCES "public"."onus"("id") 
                ON DELETE cascade ON UPDATE no action;
            `.catch(e => console.log('Note: Could not add foreign key (maybe onus table missing or different):', e.message));
        }

        console.log('✅ GenieACS tables fixed!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Fix failed:', err);
        process.exit(1);
    }
}

fix();
