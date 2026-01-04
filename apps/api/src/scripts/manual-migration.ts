import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db';

async function main() {
    console.log('Running manual migration...');

    try {
        // 1. Create notification_groups table
        console.log('Creating notification_groups table...');
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS "notification_groups" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "name" text NOT NULL,
                "telegram_enabled" boolean DEFAULT false,
                "telegram_bot_token" text,
                "telegram_chat_id" text,
                "telegram_thread_id" text,
                "whatsapp_enabled" boolean DEFAULT false,
                "whatsapp_url" text,
                "whatsapp_key" text,
                "whatsapp_to" text,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            );
        `);
        console.log('✅ Created notification_groups table');

        // 2. Add column to routers
        console.log('Adding notification_group_id to routers...');
        await db.execute(sql`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'routers' AND column_name = 'notification_group_id') THEN
                    ALTER TABLE "routers" ADD COLUMN "notification_group_id" uuid REFERENCES "public"."notification_groups"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        console.log('✅ Added notification_group_id to routers');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }

    console.log('Migration complete.');
    process.exit(0);
}

main();
