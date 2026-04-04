import { config } from 'dotenv';
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

// Robust env loading
const loadEnv = () => {
    // Try apps/api/.env
    let envPath = path.resolve(process.cwd(), '.env');
    config({ path: envPath });
    if (process.env.DATABASE_URL) return;

    // Try root .env
    envPath = path.resolve(process.cwd(), '../../.env');
    config({ path: envPath });
    if (process.env.DATABASE_URL) return;

    // Try default location for monorepo
    envPath = path.resolve(__dirname, '../../../../.env');
    config({ path: envPath });
};

loadEnv();

if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL not found in .env files.');
    console.error('Please ensure you have a .env file in the root or apps/api directory.');
    process.exit(1);
}

const runRepair = async () => {
    console.log('🔧 Starting Database Repair...');
    console.log(`📡 Connecting to database...`);

    try {
        const queryClient = postgres(process.env.DATABASE_URL!);
        const db = drizzle(queryClient);

        // 0. List all tables
        const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public';`);
        console.log('📚 Tables in public schema:', (tables as any[]).map(t => t.table_name).join(', '));
 
        // 0.1 Fix: use_snmp column in routers
        console.log('🔍 Checking routers table for SNMP toggle...');
        const checkSnmpCol = await db.execute(sql.raw(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='routers' AND column_name='use_snmp';
        `));
 
        if (checkSnmpCol.length === 0) {
            console.log('⚠️ Column use_snmp missing in routers. Adding it now...');
            await db.execute(sql`ALTER TABLE routers ADD COLUMN use_snmp boolean DEFAULT true;`);
            console.log('✅ Column use_snmp added successfully.');
        } else {
            console.log('✅ Column use_snmp already exists.');
        }

        // 0.2 Fix: snmp_host column in routers
        console.log('🔍 Checking routers table for snmp_host...');
        const checkSnmpHostCol = await db.execute(sql.raw(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='routers' AND column_name='snmp_host';
        `));

        if (checkSnmpHostCol.length === 0) {
            console.log('⚠️ Column snmp_host missing in routers. Adding it now...');
            await db.execute(sql`ALTER TABLE routers ADD COLUMN snmp_host text;`);
            console.log('✅ Column snmp_host added successfully.');
        } else {
            console.log('✅ Column snmp_host already exists.');
        }

        // 1. Fix: last_known_latency column in router_netwatch
        console.log('🔍 Checking router_netwatch table...');
        const checkColumn = await db.execute(sql.raw(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='router_netwatch' AND column_name='last_known_latency';
        `));

        if (checkColumn.length === 0) {
            console.log('⚠️ Column last_known_latency missing. Adding it now...');
            await db.execute(sql`ALTER TABLE router_netwatch ADD COLUMN last_known_latency integer;`);
            console.log('✅ Column last_known_latency added successfully.');
        } else {
            console.log('✅ Column last_known_latency already exists.');
        }

        // Status and Latency for pppoe_sessions
        const statusCols = ['status', 'last_down', 'last_latency'];
        for (const col of statusCols) {
            const checkCol = await db.execute(sql.raw(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='pppoe_sessions' AND column_name='${col}';
            `));
            if (checkCol.length === 0) {
                console.log(`⚠️ Column ${col} missing in pppoe_sessions. Adding it...`);
                const type = col === 'last_latency' ? 'integer' : (col === 'last_down' ? 'timestamp' : 'text DEFAULT \'active\'');
                await db.execute(sql.raw(`ALTER TABLE pppoe_sessions ADD COLUMN ${col} ${type};`));
            }
        }

        // Traffic Stats for pppoe_sessions
        const trafficColumns = ['tx_bytes', 'rx_bytes', 'tx_rate', 'rx_rate', 'last_traffic_update'];
        for (const col of trafficColumns) {
            const checkCol = await db.execute(sql.raw(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='pppoe_sessions' AND column_name='${col}';
            `));
            if (checkCol.length === 0) {
                console.log(`⚠️ Column ${col} missing in pppoe_sessions. Adding it...`);
                const type = col.includes('update') ? 'timestamp' : 'bigint DEFAULT 0';
                await db.execute(sql.raw(`ALTER TABLE pppoe_sessions ADD COLUMN ${col} ${type};`));
            }
        }

        // 3. Fix: router_interfaces traffic columns
        console.log('🔍 Checking router_interfaces table...');
        const interfaceColumns = [
            'tx_bytes', 'rx_bytes', 'tx_packets', 'rx_packets',
            'tx_drops', 'rx_drops', 'tx_errors', 'rx_errors',
            'tx_rate', 'rx_rate', 'last_traffic_at'
        ];
        for (const col of interfaceColumns) {
            const checkCol = await db.execute(sql.raw(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='router_interfaces' AND column_name='${col}';
            `));
            if (checkCol.length === 0) {
                console.log(`⚠️ Column ${col} missing in router_interfaces. Adding it...`);
                const type = col === 'last_traffic_at' ? 'timestamp' : 'bigint DEFAULT 0';
                await db.execute(sql.raw(`ALTER TABLE router_interfaces ADD COLUMN ${col} ${type};`));
            }
        }

        // 4. Fix: router_netwatch columns
        console.log('🔍 Checking router_netwatch table...');
        
        // Ensure host and name are nullable (for passive devices)
        console.log('🔓 Making host, name and tenant_id nullable in router_netwatch...');
        await db.execute(sql`ALTER TABLE router_netwatch ALTER COLUMN host DROP NOT NULL;`);
        await db.execute(sql`ALTER TABLE router_netwatch ALTER COLUMN name DROP NOT NULL;`);
        await db.execute(sql`ALTER TABLE router_netwatch ALTER COLUMN tenant_id DROP NOT NULL;`);

        const netwatchCols = [
            { name: 'tx_rate', type: 'bigint DEFAULT 0' },
            { name: 'rx_rate', type: 'bigint DEFAULT 0' },
            { name: 'target_interface', type: 'text' },
            { name: 'linked_onu_id', type: 'uuid' },
            { name: 'has_webhook', type: 'boolean DEFAULT false' },
            { name: 'is_app_only', type: 'boolean DEFAULT false' },
            { name: 'disabled', type: 'boolean DEFAULT false' },
            { name: 'port_capacity', type: 'integer DEFAULT 8' },
            { name: 'splitter_ratio', type: 'text' }
        ];
        for (const col of netwatchCols) {
            const checkCol = await db.execute(sql.raw(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='router_netwatch' AND column_name='${col.name}';
            `));
            if (checkCol.length === 0) {
                console.log(`⚠️ Column ${col.name} missing in router_netwatch. Adding it...`);
                await db.execute(sql.raw(`ALTER TABLE router_netwatch ADD COLUMN ${col.name} ${col.type};`));
            }
        }

        // 5. Fix: onus inventory missing columns
        console.log('🔍 Checking onus table...');
        const onuCols = [
            { name: 'model', type: 'text' },
            { name: 'ssid', type: 'text' },
            { name: 'firmware_version', type: 'text' },
            { name: 'last_down_reason', type: 'text' },
            { name: 'connection_type', type: "text DEFAULT 'router'" },
            { name: 'connected_to_id', type: 'uuid' },
            { name: 'waypoints', type: 'text' },
            { name: 'target_interface', type: 'text' }
        ];
        for (const col of onuCols) {
            const checkCol = await db.execute(sql.raw(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='onus' AND column_name='${col.name}';
            `));
            if (checkCol.length === 0) {
                console.log(`⚠️ Column ${col.name} missing in onus. Adding it...`);
                await db.execute(sql.raw(`ALTER TABLE onus ADD COLUMN ${col.name} ${col.type};`));
            }
        }

        // 6. Fix: device_performance_history missing error_message
        console.log('🔍 Checking device_performance_history table...');
        const checkPerfErr = await db.execute(sql.raw(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name='device_performance_history' AND column_name='error_message';
        `));
        if (checkPerfErr.length === 0) {
            console.log('⚠️ Column error_message missing in device_performance_history. Adding it...');
            await db.execute(sql`ALTER TABLE device_performance_history ADD COLUMN error_message text;`);
        }

        // 7. Fix: Missing Indexes for Performance
        console.log('🔍 Checking for missing performance indexes...');
        
        // router_interfaces(router_id, name)
        const checkInterfaceIdx = await db.execute(sql`
            SELECT indexname FROM pg_indexes 
            WHERE tablename = 'router_interfaces' AND indexname = 'router_interfaces_combined_idx';
        `);
        if (checkInterfaceIdx.length === 0) {
            console.log('⚠️ Index router_interfaces_combined_idx missing. Creating it...');
            await db.execute(sql`CREATE INDEX IF NOT EXISTS router_interfaces_combined_idx ON router_interfaces (router_id, name);`);
            console.log('✅ Index router_interfaces_combined_idx created.');
        }

        // router_metrics(router_id, recorded_at)
        const checkMetricsIdx = await db.execute(sql`
            SELECT indexname FROM pg_indexes 
            WHERE tablename = 'router_metrics' AND indexname = 'router_metrics_combined_idx';
        `);
        if (checkMetricsIdx.length === 0) {
            console.log('⚠️ Index router_metrics_combined_idx missing. Creating it...');
            await db.execute(sql`CREATE INDEX IF NOT EXISTS router_metrics_combined_idx ON router_metrics (router_id, recorded_at);`);
            console.log('✅ Index router_metrics_combined_idx created.');
        }

        console.log('🎉 Database repair completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Repair failed:', err);
        process.exit(1);
    }
};

runRepair();
