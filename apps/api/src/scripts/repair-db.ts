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
        
        // 5.0 EMERGENCY FIX: Convert onus back to regular table if it accidentally became a hypertable
        // TimescaleDB hypertables do not support standard UPSERT (ON CONFLICT) for non-time columns, 
        // which breaks OLT sync.
        console.log('🔍 Checking if "onus" table is a hypertable...');
        let isHyper = false;
        try {
            // Try public view first (Stable API)
            const checkPublic = await db.execute(sql.raw(`
                SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_name = 'onus';
            `));
            if (checkPublic.length > 0) isHyper = true;
        } catch (e) {
            try {
                // Fallback to internal catalog (Legacy/Internal)
                const checkInternal = await db.execute(sql.raw(`
                    SELECT table_name FROM _timescaledb_catalog.hypertable WHERE table_name = 'onus';
                `));
                if (checkInternal.length > 0) isHyper = true;
            } catch (e2) {
                // Probably not a hypertable or no TimescaleDB
            }
        }

        if (isHyper) {
            console.log('🚨 ALERT: Table "onus" IS detected as a hypertable. Starting conversion to regular table...');
            try {
                // A safe migration that preserves data and foreign keys
                await db.transaction(async (tx) => {
                    // Create temp table with same structure but NOT as hypertable
                    console.log('   (1/5) Creating temp table...');
                    await tx.execute(sql`CREATE TABLE IF NOT EXISTS onus_repair_temp (LIKE onus INCLUDING ALL);`);
                    await tx.execute(sql`TRUNCATE TABLE onus_repair_temp;`);
                    await tx.execute(sql`INSERT INTO onus_repair_temp SELECT * FROM onus;`);
                    
                    // Drop the hypertable (this will drop FKs, we'll restore them)
                    console.log('   (2/5) Dropping hypertable...');
                    await tx.execute(sql`DROP TABLE onus CASCADE;`);
                    
                    // Rename temp to original
                    console.log('   (3/5) Restoring table name...');
                    await tx.execute(sql`ALTER TABLE onus_repair_temp RENAME TO onus;`);
                    
                    // Restore key foreign keys exactly as per schema/index.ts
                    console.log('   (4/5) Restoring foreign keys...');
                    await tx.execute(sql`ALTER TABLE onus ADD CONSTRAINT onus_olt_id_olts_id_fk FOREIGN KEY (olt_id) REFERENCES olts(id) ON DELETE SET NULL;`);
                    await tx.execute(sql`ALTER TABLE onus ADD CONSTRAINT onus_router_id_routers_id_fk FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE SET NULL;`);
                    await tx.execute(sql`ALTER TABLE onus ADD CONSTRAINT onus_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id);`);
                    
                    // Restore Indexes
                    console.log('   (5/5) Restoring indexes...');
                    await tx.execute(sql`CREATE INDEX IF NOT EXISTS onus_olt_id_idx ON onus (olt_id);`);
                    await tx.execute(sql`CREATE INDEX IF NOT EXISTS onus_router_id_idx ON onus (router_id);`);
                    await tx.execute(sql`CREATE INDEX IF NOT EXISTS onus_status_idx ON onus (status);`);

                    // Restore router_netwatch reference if it was dropped
                    console.log('   (Bonus) Restoring netwatch references...');
                    const checkNetwatchOnuCol = await tx.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_name='router_netwatch' AND column_name='linked_onu_id';`);
                    if (checkNetwatchOnuCol.length > 0) {
                        try {
                            await tx.execute(sql`ALTER TABLE router_netwatch ADD CONSTRAINT router_netwatch_linked_onu_id_onus_id_fk FOREIGN KEY (linked_onu_id) REFERENCES onus(id) ON DELETE SET NULL;`);
                        } catch (e) {
                            console.log('   - Netwatch FK skip or handled');
                        }
                    }
                });
                console.log('✅ Table "onus" converted back to regular table successfully.');
            } catch (err: any) {
                console.error('❌ Failed to convert "onus" table:', err.message);
                console.error('   Diagnostic: Check if any other table has a hard Foreign Key to onus.');
            }
        } else {
            console.log('✅ Table "onus" is already a regular table (or hypertable check failed/skipped).');
        }

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

        // 6. Fix: device_performance_history missing columns
        console.log('🔍 Checking device_performance_history table...');
        const perfCols = [
            { name: 'error_message', type: 'text' },
            { name: 'signal', type: 'real' },
            { name: 'latency', type: 'real' },
            { name: 'recorded_at', type: 'timestamp DEFAULT now() NOT NULL' }
        ];
        for (const col of perfCols) {
            const checkCol = await db.execute(sql.raw(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='device_performance_history' AND column_name='${col.name}';
            `));
            if (checkCol.length === 0) {
                console.log(`⚠️ Column ${col.name} missing in device_performance_history. Adding it...`);
                await db.execute(sql.raw(`ALTER TABLE device_performance_history ADD COLUMN ${col.name} ${col.type};`));
            }
        }

        // 6.1 Fix: metrics tables recorded_at
        const metricsTables = ['router_metrics', 'router_interface_metrics'];
        for (const table of metricsTables) {
            const checkAt = await db.execute(sql.raw(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name='${table}' AND column_name='recorded_at';
            `));
            if (checkAt.length === 0) {
                console.log(`⚠️ Column recorded_at missing in ${table}. Adding it...`);
                await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN recorded_at timestamp DEFAULT now() NOT NULL;`));
            }
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

        // 8. Fix: router_netwatch stabilization (Deduplication + Unique Index)
        console.log('🔍 Stabilizing router_netwatch...');
        
        // 8.0 Cleanup invalid empty strings that would block unique index
        console.log('🧹 Normalizing empty hosts to NULL in router_netwatch...');
        await db.execute(sql`UPDATE router_netwatch SET host = NULL WHERE host = '';`);

        // 8.1 Cleanup duplicates (ONLY for entries with Host to protect passive markers/ODPs)
        await db.execute(sql`
            DELETE FROM router_netwatch 
            WHERE id IN (
                SELECT id 
                FROM (
                    SELECT id, ROW_NUMBER() OVER(
                        PARTITION BY router_id, host 
                        ORDER BY updated_at DESC, id DESC
                    ) as rn 
                    FROM router_netwatch
                    WHERE host IS NOT NULL AND host != ''
                ) t 
                WHERE t.rn > 1
            )
        `);
        // 8.2 Add unique index
        const checkNetwatchIdx = await db.execute(sql`
            SELECT indexname FROM pg_indexes 
            WHERE tablename = 'router_netwatch' AND indexname = 'router_netwatch_router_host_unique_idx';
        `);
        if (checkNetwatchIdx.length === 0) {
            console.log('⚠️ Unique index router_netwatch_router_host_unique_idx missing. Creating it...');
            await db.execute(sql`CREATE UNIQUE INDEX router_netwatch_router_host_unique_idx ON router_netwatch (router_id, host);`);
            console.log('✅ Unique index for router_netwatch created.');
        }

        // 9. Fix: pppoe_sessions stabilization (Deduplication + Unique Index)
        console.log('🔍 Stabilizing pppoe_sessions...');
        // 9.1 Cleanup duplicates
        await db.execute(sql`
            DELETE FROM pppoe_sessions 
            WHERE id IN (
                SELECT id 
                FROM (
                    SELECT id, ROW_NUMBER() OVER(
                        PARTITION BY router_id, name 
                        ORDER BY last_seen DESC, connected_at DESC, id DESC
                    ) as rn 
                    FROM pppoe_sessions
                    WHERE name IS NOT NULL AND name != ''
                ) t 
                WHERE t.rn > 1
            )
        `);
        // 9.2 Add unique index
        const checkPppoeIdx = await db.execute(sql`
            SELECT indexname FROM pg_indexes 
            WHERE tablename = 'pppoe_sessions' AND indexname = 'pppoe_sessions_router_name_unique_idx';
        `);
        if (checkPppoeIdx.length === 0) {
            console.log('⚠️ Unique index pppoe_sessions_router_name_unique_idx missing. Creating it...');
            await db.execute(sql`CREATE UNIQUE INDEX pppoe_sessions_router_name_unique_idx ON pppoe_sessions (router_id, name);`);
            console.log('✅ Unique index for pppoe_sessions created.');
        }

        // 10. Metrics Restoration: Decompress hypertables to allow new data
        console.log('🧊 Checking for compressed chunks in metrics tables (Schema Qualified)...');
        const hyperTables = ['device_performance_history', 'router_interface_metrics', 'router_metrics'];
        
        for (const tableName of hyperTables) {
            try {
                // Find compressed chunks with their schema
                const chunks = await db.execute(sql.raw(`
                    SELECT i.chunk_schema, i.chunk_name 
                    FROM timescaledb_information.chunks i 
                    WHERE i.hypertable_name = '${tableName}' AND i.is_compressed = true
                    ORDER BY i.range_start DESC;
                `)) as any[];

                if (chunks.length > 0) {
                    console.log(`⚠️ Found ${chunks.length} compressed chunks in "${tableName}". Restoring access...`);
                    
                    // Try to disable compression policy first (to prevent re-compression)
                    try {
                        await queryClient.unsafe(`SELECT remove_compression_policy('${tableName}', if_exists => true);`);
                        console.log(`   - Suspended compression policy for ${tableName}`);
                    } catch (e) {}

                    for (const chunk of chunks) {
                        try {
                            const fullName = `${chunk.chunk_schema}.${chunk.chunk_name}`;
                            console.log(`   - Decompressing ${fullName}...`);
                            await queryClient.unsafe(`SELECT decompress_chunk('${fullName}', if_compressed => true);`);
                        } catch (e: any) {
                            console.log(`   - Skipping ${chunk.chunk_name}: ${e.message.split('\n')[0]}`);
                        }
                    }
                } else {
                    console.log(`✅ Table "${tableName}" has no blocking compressed chunks.`);
                }
            } catch (err: any) {
                console.log(`ℹ️ Info: Hypertables check skipped for ${tableName} (${err.message.split('\n')[0]})`);
            }
        }

        console.log('🎉 Database stabilization, repair & metrics restoration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Repair failed:', err);
        process.exit(1);
    }
};

runRepair();
