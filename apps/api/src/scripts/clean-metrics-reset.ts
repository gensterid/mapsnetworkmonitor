
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust env loading
const searchPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'apps', 'api', '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
    path.join(__dirname, '..', '..', '..', '..', '.env'),
];

for (const p of searchPaths) {
    dotenv.config({ path: p });
    if (process.env.DATABASE_URL) {
        console.log(`✅ Loaded env from: ${p}`);
        break;
    }
}

async function runCleanReset() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    console.log('📡 Connecting to database for CLEAN METRICS RESET...');
    const queryClient = postgres(connectionString);
    const db = drizzle(queryClient);

    try {
        console.log('\n⚠️  WARNING: This will delete ALL historical metrics but KEEP your map and devices.');
        
        // 1. Drop Tables (Ordered to handle dependencies if any)
        const tablesToDrop = [
            'device_performance_history',
            'router_metrics',
            'router_interface_metrics'
        ];

        for (const table of tablesToDrop) {
            console.log(`🗑️  Dropping table ${table}...`);
            await db.execute(sql.raw(`DROP TABLE IF EXISTS ${table} CASCADE;`));
        }

        // 2. Recreate device_performance_history
        console.log('🏗️  Recreating device_performance_history...');
        await db.execute(sql.raw(`
            CREATE TABLE IF NOT EXISTS "device_performance_history" (
                "id" uuid DEFAULT gen_random_uuid() NOT NULL,
                "tenant_id" uuid NOT NULL,
                "router_id" uuid NOT NULL,
                "host" text,
                "onu_id" uuid,
                "latency" real,
                "signal" real,
                "error_message" text,
                "recorded_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "device_performance_history_pkey" PRIMARY KEY ("id", "recorded_at"),
                CONSTRAINT "device_performance_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
                CONSTRAINT "device_performance_history_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE cascade,
                CONSTRAINT "device_performance_history_onu_id_onus_id_fk" FOREIGN KEY ("onu_id") REFERENCES "onus"("id") ON DELETE cascade
            );
            CREATE INDEX IF NOT EXISTS "dev_perf_router_id_idx" ON "device_performance_history" ("router_id");
            CREATE INDEX IF NOT EXISTS "dev_perf_tenant_id_idx" ON "device_performance_history" ("tenant_id");
            CREATE INDEX IF NOT EXISTS "dev_perf_host_idx" ON "device_performance_history" ("host");
            CREATE INDEX IF NOT EXISTS "dev_perf_onu_id_idx" ON "device_performance_history" ("onu_id");
            CREATE INDEX IF NOT EXISTS "dev_perf_recorded_at_idx" ON "device_performance_history" ("recorded_at");
            CREATE INDEX IF NOT EXISTS "dev_perf_combined_idx" ON "device_performance_history" ("router_id", "recorded_at" DESC);
            SELECT create_hypertable('device_performance_history', 'recorded_at', if_not_exists => TRUE);
        `));

        // 3. Recreate router_metrics
        console.log('🏗️  Recreating router_metrics...');
        await db.execute(sql.raw(`
            CREATE TABLE IF NOT EXISTS "router_metrics" (
                "id" uuid DEFAULT gen_random_uuid() NOT NULL,
                "router_id" uuid NOT NULL,
                "cpu_load" real,
                "cpu_count" integer,
                "cpu_frequency" integer,
                "total_memory" bigint,
                "used_memory" bigint,
                "free_memory" bigint,
                "total_disk" bigint,
                "used_disk" bigint,
                "free_disk" bigint,
                "uptime" integer,
                "temperature" real,
                "voltage" real,
                "board_temp" real,
                "current_firmware" text,
                "upgrade_firmware" text,
                "tenant_id" uuid,
                "recorded_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "router_metrics_pkey" PRIMARY KEY ("id", "recorded_at"),
                CONSTRAINT "router_metrics_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE cascade,
                CONSTRAINT "router_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
            );
            CREATE INDEX IF NOT EXISTS "router_metrics_router_id_idx" ON "router_metrics" ("router_id");
            CREATE INDEX IF NOT EXISTS "router_metrics_tenant_id_idx" ON "router_metrics" ("tenant_id");
            CREATE INDEX IF NOT EXISTS "router_metrics_recorded_at_idx" ON "router_metrics" ("recorded_at");
            CREATE INDEX IF NOT EXISTS "router_metrics_combined_idx" ON "router_metrics" ("router_id", "recorded_at");
            CREATE INDEX IF NOT EXISTS "router_metrics_recorded_at_desc_idx" ON "router_metrics" ("recorded_at" DESC);
            SELECT create_hypertable('router_metrics', 'recorded_at', if_not_exists => TRUE);
        `));

        // 4. Recreate router_interface_metrics
        console.log('🏗️  Recreating router_interface_metrics...');
        await db.execute(sql.raw(`
            CREATE TABLE IF NOT EXISTS "router_interface_metrics" (
                "id" uuid DEFAULT gen_random_uuid() NOT NULL,
                "interface_id" uuid NOT NULL,
                "tx_bytes" bigint,
                "rx_bytes" bigint,
                "tx_packets" bigint,
                "rx_packets" bigint,
                "tx_errors" bigint,
                "rx_errors" bigint,
                "tx_drops" bigint,
                "rx_drops" bigint,
                "tx_rate" bigint,
                "rx_rate" bigint,
                "tenant_id" uuid,
                "recorded_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "router_interface_metrics_pkey" PRIMARY KEY ("id", "recorded_at"),
                CONSTRAINT "router_interface_metrics_interface_id_router_interfaces_id_fk" FOREIGN KEY ("interface_id") REFERENCES "router_interfaces"("id") ON DELETE cascade,
                CONSTRAINT "router_interface_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
            );
            CREATE INDEX IF NOT EXISTS "router_if_metrics_interface_id_idx" ON "router_interface_metrics" ("interface_id");
            CREATE INDEX IF NOT EXISTS "router_if_metrics_tenant_id_idx" ON "router_interface_metrics" ("tenant_id");
            CREATE INDEX IF NOT EXISTS "router_if_metrics_recorded_at_idx" ON "router_interface_metrics" ("recorded_at");
            SELECT create_hypertable('router_interface_metrics', 'recorded_at', if_not_exists => TRUE);
        `));

        // 5. Cleanup Alerts (Optional Reset)
        console.log('🧹 Clearing legacy alerts for fresh start...');
        await db.execute(sql`TRUNCATE TABLE alerts CASCADE;`);

        console.log('\n✅ CLEAN RESET COMPLETE! Your schema is now perfectly aligned with the latest standards.');
    } catch (err) {
        console.error('❌ Clean reset failed:', err);
    } finally {
        await queryClient.end();
    }
}

runCleanReset();
