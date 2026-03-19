import 'dotenv/config';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { partitionService } from '../services/db/partition.service.js';

async function migrate() {
    logger.info('🚀 Starting PostgreSQL Partitioning Migration (P3.1)...');

    const tables = [
        {
            name: 'router_metrics',
            schema: `
                id uuid NOT NULL DEFAULT gen_random_uuid(),
                router_id uuid NOT NULL,
                cpu_load real,
                cpu_count integer,
                cpu_frequency integer,
                total_memory bigint,
                used_memory bigint,
                free_memory bigint,
                total_disk bigint,
                used_disk bigint,
                free_disk bigint,
                uptime integer,
                temperature real,
                voltage real,
                board_temp real,
                current_firmware text,
                upgrade_firmware text,
                tenant_id uuid,
                recorded_at timestamp with time zone NOT NULL DEFAULT now(),
                CONSTRAINT router_metrics_pk PRIMARY KEY (id, recorded_at)
            `
        },
        {
            name: 'router_interface_metrics',
            schema: `
                id uuid NOT NULL DEFAULT gen_random_uuid(),
                interface_id uuid NOT NULL,
                tx_rate bigint DEFAULT 0,
                rx_rate bigint DEFAULT 0,
                tenant_id uuid,
                recorded_at timestamp with time zone NOT NULL DEFAULT now(),
                CONSTRAINT router_interface_metrics_pk PRIMARY KEY (id, recorded_at)
            `
        },
        {
            name: 'device_performance_history',
            schema: `
                id uuid NOT NULL DEFAULT gen_random_uuid(),
                tenant_id uuid NOT NULL,
                router_id uuid NOT NULL,
                host text,
                onu_id uuid,
                latency real,
                signal real,
                error_message text,
                recorded_at timestamp with time zone NOT NULL DEFAULT now(),
                CONSTRAINT device_performance_history_pk PRIMARY KEY (id, recorded_at)
            `
        }
    ];

    try {
        for (const table of tables) {
            logger.info(`Processing table: ${table.name}`);

            // 1. Check if already partitioned
            const isPartitioned = await db.execute(sql`
                SELECT relkind FROM pg_class c 
                JOIN pg_namespace n ON n.oid = c.relnamespace 
                WHERE c.relname = ${table.name} AND n.nspname = 'public'
            `);

            if (isPartitioned[0]?.relkind === 'p') {
                logger.info(`Table ${table.name} is already partitioned. Skipping structural migration.`);
                continue;
            }

            // 2. Rename existing table to _legacy
            logger.info(`Renaming ${table.name} to ${table.name}_legacy`);
            await db.execute(sql.raw(`ALTER TABLE IF EXISTS "${table.name}" RENAME TO "${table.name}_legacy"`));

            // 3. Create new partitioned table
            logger.info(`Creating partitioned table ${table.name}`);
            await db.execute(sql.raw(`
                CREATE TABLE "${table.name}" (
                    ${table.schema}
                ) PARTITION BY RANGE (recorded_at)
            `));

            // 4. Create indexes (manually since Drizzle Kit won't see them on partitioned table correctly if not in schema)
            // Wait, if I don't add them to schema, Drizzle Kit might complain.
            // But I'll add them here to be sure the DB is performant.
            if (table.name === 'router_metrics') {
                await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "router_metrics_router_id_idx" ON "router_metrics" ("router_id")`));
                await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "router_metrics_recorded_at_idx" ON "router_metrics" ("recorded_at")`));
            } else if (table.name === 'router_interface_metrics') {
                await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "router_if_metrics_interface_id_idx" ON "router_interface_metrics" ("interface_id")`));
                await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "router_if_metrics_recorded_at_idx" ON "router_interface_metrics" ("recorded_at")`));
            } else if (table.name === 'device_performance_history') {
                await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "dev_perf_router_id_idx" ON "device_performance_history" ("router_id")`));
                await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "dev_perf_recorded_at_idx" ON "device_performance_history" ("recorded_at")`));
            }
        }

        // 5. Bootstrap partitions via the service
        logger.info('Bootstrapping initial partitions...');
        await partitionService.ensurePartitionsExist();

        logger.info('✅ Partitioning migration completed successfully!');
    } catch (error) {
        logger.error({ err: error }, '❌ Partitioning migration failed!');
        process.exit(1);
    }

    process.exit(0);
}

migrate();
