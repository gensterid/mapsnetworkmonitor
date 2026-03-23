import 'dotenv/config';
import postgres from 'postgres';

async function repair() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ DATABASE_URL is not set');
        process.exit(1);
    }

    console.log('🛠️ Starting Database Schema Repair...');
    const sql = postgres(connectionString);

    try {
        // 1. Repair 'onus' table
        console.log('📝 Checking "onus" table...');
        
        await sql`
            DO $$ 
            BEGIN 
                -- Add pppoe_user
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='onus' AND column_name='pppoe_user') THEN
                    ALTER TABLE onus ADD COLUMN pppoe_user TEXT;
                    RAISE NOTICE 'Added pppoe_user to onus';
                END IF;

                -- Add pppoe_pass
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='onus' AND column_name='pppoe_pass') THEN
                    ALTER TABLE onus ADD COLUMN pppoe_pass TEXT;
                    RAISE NOTICE 'Added pppoe_pass to onus';
                END IF;

                -- Add vlan_id
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='onus' AND column_name='vlan_id') THEN
                    ALTER TABLE onus ADD COLUMN vlan_id INTEGER;
                    RAISE NOTICE 'Added vlan_id to onus';
                END IF;
            END $$;
        `;
        console.log('✅ "onus" table repaired!');

        // 2. Add other missing columns found in logs (if any)
        // From logs: "topology_x" or "topology_y" in "olts"?
        console.log('📝 Checking "olts" table...');
        await sql`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='olts' AND column_name='topology_x') THEN
                    ALTER TABLE olts ADD COLUMN topology_x INTEGER;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='olts' AND column_name='topology_y') THEN
                    ALTER TABLE olts ADD COLUMN topology_y INTEGER;
                END IF;
            END $$;
        `;
        console.log('✅ "olts" table repaired!');
        
        // 3. Repair 'routers' table
        console.log('📝 Checking "routers" table...');
        await sql`
            DO $$ 
            BEGIN 
                -- Add use_snmp
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routers' AND column_name='use_snmp') THEN
                    ALTER TABLE routers ADD COLUMN use_snmp BOOLEAN DEFAULT TRUE NOT NULL;
                    RAISE NOTICE 'Added use_snmp to routers';
                END IF;
            END $$;
        `;
        console.log('✅ "routers" table repaired!');

        console.log('\n✨ Database repair completed successfully!');
    } catch (err: any) {
        console.error('❌ Repair failed:', err.message);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

repair();
