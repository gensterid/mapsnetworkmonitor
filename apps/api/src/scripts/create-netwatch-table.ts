import 'dotenv/config';
import postgres from 'postgres';

async function createNetwatchTable() {
    const sql = postgres(process.env.DATABASE_URL!);

    try {
        console.log('Checking if router_netwatch table exists...');

        // Check if table exists
        const result = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public'
                AND table_name = 'router_netwatch'
            );
        `;

        if (result[0].exists) {
            console.log('router_netwatch table already exists!');
        } else {
            console.log('Creating netwatch_status enum...');

            // Create enum if not exists
            await sql`
                DO $$ BEGIN
                    CREATE TYPE netwatch_status AS ENUM ('up', 'down', 'unknown');
                EXCEPTION
                    WHEN duplicate_object THEN null;
                END $$;
            `;

            console.log('Creating router_netwatch table...');

            // Create table
            await sql`
                CREATE TABLE IF NOT EXISTS router_netwatch (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    router_id uuid NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
                    host text NOT NULL,
                    name text,
                    interval integer DEFAULT 30,
                    status netwatch_status DEFAULT 'unknown',
                    last_check timestamp,
                    last_up timestamp,
                    last_down timestamp,
                    latitude numeric(10, 7),
                    longitude numeric(10, 7),
                    location text,
                    created_at timestamp DEFAULT now() NOT NULL,
                    updated_at timestamp DEFAULT now() NOT NULL
                );
            `;

            console.log('router_netwatch table created successfully!');
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }

    process.exit(0);
}

createNetwatchTable();
