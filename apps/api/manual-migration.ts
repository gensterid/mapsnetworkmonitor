import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
    console.log('Starting manual migration...');

    try {
        // 1. Create Enum Type safely
        // Postgres doesn't have CREATE TYPE IF NOT EXISTS natively for ENUMs in older versions, 
        // but we can catch the error or check catalog.
        try {
            await db.execute(sql`CREATE TYPE "public"."onu_status" AS ENUM('online', 'offline', 'lost', 'power_down', 'dying_gasp', 'unknown')`);
            console.log('Created type onu_status');
        } catch (e: any) {
            console.log('Type onu_status likely exists:', e.message);
        }

        // 2. Create ONUS Table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS "onus" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "sn" text NOT NULL,
                "olt_id" uuid NOT NULL,
                "pon_port" text,
                "onu_index" text,
                "name" text,
                "host" text,
                "last_rx_power" text,
                "status" "onu_status" DEFAULT 'unknown' NOT NULL,
                "last_seen" timestamp,
                "latitude" numeric(10, 7),
                "longitude" numeric(10, 7),
                "location" text,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL,
                "discovery_sources" json DEFAULT '[]'::json,
                CONSTRAINT "onus_sn_unique" UNIQUE("sn")
            );
        `);
        console.log('Ensured table onus exists');

        // 3. Add Columns to OLTs
        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "last_snmp_status" text`);
        await db.execute(sql`ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "last_web_status" text`);
        console.log('Updated olts table');

        // 4. Add Columns to Routers
        await db.execute(sql`ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "genieacs_username" text`);
        await db.execute(sql`ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "genieacs_password_encrypted" text`);
        console.log('Updated routers table');

        // 5. Add FK Constraint if it doesn't exist
        // This is harder to check with IF NOT EXISTS directly.
        // We can try to add it and catch duplicate error.
        try {
            await db.execute(sql`ALTER TABLE "onus" ADD CONSTRAINT "onus_olt_id_olts_id_fk" FOREIGN KEY ("olt_id") REFERENCES "public"."olts"("id") ON DELETE cascade ON UPDATE no action`);
            console.log('Added FK constraint');
        } catch (e: any) {
            console.log('FK constraint likely exists:', e.message);
        }

        console.log('Manual migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
    process.exit(0);
}

runMigration();
