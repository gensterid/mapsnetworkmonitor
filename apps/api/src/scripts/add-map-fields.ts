import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!);

async function runMigration() {
    console.log('Running migration to add map fields...');

    try {
        // Add device_type enum if not exists
        await sql`
            DO $$ BEGIN
                CREATE TYPE "public"."device_type" AS ENUM('client', 'olt', 'odp');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$
        `;
        console.log('✓ device_type enum ready');

        // Check if device_type column exists
        const deviceTypeCol = await sql`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'router_netwatch' AND column_name = 'device_type'
        `;

        if (deviceTypeCol.length === 0) {
            await sql`ALTER TABLE "router_netwatch" ADD COLUMN "device_type" "device_type" DEFAULT 'client'`;
            console.log('✓ Added device_type column');
        } else {
            console.log('✓ device_type column already exists');
        }

        // Check if waypoints column exists
        const waypointsCol = await sql`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'router_netwatch' AND column_name = 'waypoints'
        `;

        if (waypointsCol.length === 0) {
            await sql`ALTER TABLE "router_netwatch" ADD COLUMN "waypoints" text`;
            console.log('✓ Added waypoints column');
        } else {
            console.log('✓ waypoints column already exists');
        }

        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

runMigration();
