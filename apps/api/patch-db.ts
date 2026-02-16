import { db } from './src/db/index';
import { sql } from 'drizzle-orm';

async function patch() {
    console.log('Starting manual database patch...');
    try {
        await db.execute(sql`ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "connection_type" text DEFAULT 'router'`);
        console.log('Added connection_type');

        await db.execute(sql`ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "connected_to_id" uuid`);
        console.log('Added connected_to_id');

        await db.execute(sql`ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "waypoints" text`);
        console.log('Added waypoints');

        await db.execute(sql`ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "target_interface" text`);
        console.log('Added target_interface');

        console.log('Database patch completed successfully.');
    } catch (err) {
        console.error('Database patch failed:', err);
    } finally {
        process.exit(0);
    }
}

patch();
