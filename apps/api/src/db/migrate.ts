import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { logger } from '../lib/logger.js';

export async function runMigrations() {
    try {
        console.log('🔄 Checking core database schema...');

        // 1. Ensure enums exist and are up to date
        try {
            await db.execute(sql`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'operator', 'user'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
            await db.execute(sql`DO $$ BEGIN CREATE TYPE router_backup_type AS ENUM ('backup', 'rsc'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
            
            // Add 'json' value if missing (failsafe for existing DBs)
            await db.execute(sql`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'router_backup_type' AND e.enumlabel = 'json') THEN
                        ALTER TYPE router_backup_type ADD VALUE 'json';
                    END IF;
                END
                $$;
            `);
        } catch (e) { /* ignore or log */ }

        // 2. Ensure device_type enum has new values
        try {
            await db.execute(sql`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'device_type' AND e.enumlabel = 'router') THEN
                        ALTER TYPE device_type ADD VALUE 'router';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'device_type' AND e.enumlabel = 'switch') THEN
                        ALTER TYPE device_type ADD VALUE 'switch';
                    END IF;
                EXCEPTION
                    WHEN undefined_object THEN
                        -- If the type doesn't exist at all, it will be created by Drizzle or other steps, 
                        -- though usually it should exist by now if the tables are being created.
                        NULL;
                END
                $$;
            `);
        } catch (e) {
            logger.warn({ err: e }, 'Failed to ensure device_type enum values exist');
        }

        // 2. Ensure Better Auth tables exist
        const authTables = [
            {
                name: 'users',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS users (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        email TEXT NOT NULL UNIQUE,
                        username TEXT UNIQUE,
                        name TEXT NOT NULL,
                        image TEXT,
                        email_verified BOOLEAN NOT NULL DEFAULT false,
                        role TEXT NOT NULL DEFAULT 'user',
                        timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
                        animation_style TEXT DEFAULT 'default',
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            },
            {
                name: 'sessions',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS sessions (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        token TEXT NOT NULL UNIQUE,
                        expires_at TIMESTAMP NOT NULL,
                        ip_address TEXT,
                        user_agent TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            },
            {
                name: 'accounts',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS accounts (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        account_id TEXT NOT NULL,
                        provider_id TEXT NOT NULL,
                        access_token TEXT,
                        refresh_token TEXT,
                        access_token_expires_at TIMESTAMP,
                        refresh_token_expires_at TIMESTAMP,
                        scope TEXT,
                        password TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            },
            {
                name: 'verifications',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS verifications (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        identifier TEXT NOT NULL,
                        value TEXT NOT NULL,
                        expires_at TIMESTAMP NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                `
            },
            {
                name: 'tenants',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS tenants (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name TEXT NOT NULL,
                        slug TEXT NOT NULL UNIQUE,
                        description TEXT,
                        settings TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            },
            {
                name: 'topology_nodes',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS topology_nodes (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
                        node_id UUID,
                        node_type TEXT NOT NULL,
                        custom_name TEXT,
                        custom_host TEXT,
                        custom_type TEXT,
                        notes TEXT,
                        x DECIMAL(10, 2) NOT NULL DEFAULT 0,
                        y DECIMAL(10, 2) NOT NULL DEFAULT 0,
                        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            },
            {
                name: 'topology_links',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS topology_links (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
                        source_node_id UUID NOT NULL,
                        target_node_id UUID NOT NULL,
                        source_interface TEXT,
                        target_interface TEXT,
                        source_handle TEXT,
                        target_handle TEXT,
                        notes TEXT,
                        path_offset DECIMAL(10, 2) DEFAULT 0,
                        animation_type TEXT DEFAULT 'pulse',
                        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            },
            {
                name: 'device_performance_history',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS device_performance_history (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
                        host TEXT,
                        onu_id UUID REFERENCES onus(id) ON DELETE CASCADE,
                        latency REAL,
                        signal REAL,
                        recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            },
            {
                name: 'router_interface_metrics',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS router_interface_metrics (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        interface_id UUID NOT NULL REFERENCES router_interfaces(id) ON DELETE CASCADE,
                        tx_rate BIGINT DEFAULT 0,
                        rx_rate BIGINT DEFAULT 0,
                        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                        recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            },
            {
                name: 'router_backups',
                sql: sql`
                    CREATE TABLE IF NOT EXISTS router_backups (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        router_id UUID NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
                        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        filename TEXT NOT NULL,
                        type router_backup_type NOT NULL,
                        size BIGINT DEFAULT 0,
                        comment TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                `
            }
        ];

        for (const table of authTables) {
            try {
                await db.execute(table.sql);
                // console.log(`✅ Ensured table: ${table.name}`);
            } catch (err) {
                logger.error({ err, table: table.name }, 'Failed to ensure auth table exists');
            }
        }

        const migrations = [
            {
                name: 'alerts.escalation_level',
                sql: sql`ALTER TABLE alerts ADD COLUMN escalation_level INTEGER DEFAULT 0 NOT NULL`
            },
            {
                name: 'alerts.last_escalated_at',
                sql: sql`ALTER TABLE alerts ADD COLUMN last_escalated_at TIMESTAMP`
            },
            {
                name: 'pppoe_sessions.latitude',
                sql: sql`ALTER TABLE pppoe_sessions ADD COLUMN latitude TEXT`
            },
            {
                name: 'pppoe_sessions.longitude',
                sql: sql`ALTER TABLE pppoe_sessions ADD COLUMN longitude TEXT`
            },
            {
                name: 'pppoe_sessions.waypoints',
                sql: sql`ALTER TABLE pppoe_sessions ADD COLUMN waypoints TEXT`
            },
            {
                name: 'users.timezone',
                sql: sql`ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Asia/Jakarta' NOT NULL`
            },
            {
                name: 'users.animation_style',
                sql: sql`ALTER TABLE users ADD COLUMN animation_style TEXT DEFAULT 'default'`
            },
            {
                name: 'router_netwatch.target_interface',
                sql: sql`ALTER TABLE router_netwatch ADD COLUMN target_interface TEXT`
            },
            {
                name: 'router_netwatch.tx_rate',
                sql: sql`ALTER TABLE router_netwatch ADD COLUMN tx_rate BIGINT DEFAULT 0`
            },
            {
                name: 'router_netwatch.rx_rate',
                sql: sql`ALTER TABLE router_netwatch ADD COLUMN rx_rate BIGINT DEFAULT 0`
            },
            {
                name: 'router_netwatch.linked_onu_id',
                sql: sql`ALTER TABLE router_netwatch ADD COLUMN linked_onu_id UUID`
            },
            {
                name: 'routers.use_genieacs',
                sql: sql`ALTER TABLE routers ADD COLUMN use_genieacs BOOLEAN DEFAULT false NOT NULL`
            },
            {
                name: 'routers.use_webhook',
                sql: sql`ALTER TABLE routers ADD COLUMN use_webhook BOOLEAN DEFAULT false NOT NULL`
            },
            {
                name: 'routers.webhook_secret',
                sql: sql`ALTER TABLE routers ADD COLUMN webhook_secret TEXT`
            },
            {
                name: 'routers.polling_interval_metrics',
                sql: sql`ALTER TABLE routers ADD COLUMN polling_interval_metrics INTEGER DEFAULT 300 NOT NULL`
            },
            {
                name: 'routers.genieacs_url',
                sql: sql`ALTER TABLE routers ADD COLUMN genieacs_url TEXT`
            },
            {
                name: 'routers.genieacs_username',
                sql: sql`ALTER TABLE routers ADD COLUMN genieacs_username TEXT`
            },
            {
                name: 'routers.genieacs_password_encrypted',
                sql: sql`ALTER TABLE routers ADD COLUMN genieacs_password_encrypted TEXT`
            },
            {
                name: 'olts.last_snmp_status',
                sql: sql`ALTER TABLE olts ADD COLUMN last_snmp_status TEXT`
            },
            {
                name: 'olts.last_web_status',
                sql: sql`ALTER TABLE olts ADD COLUMN last_web_status TEXT`
            },
            {
                name: 'olts.latitude',
                sql: sql`ALTER TABLE olts ADD COLUMN latitude NUMERIC(10, 7)`
            },
            {
                name: 'olts.longitude',
                sql: sql`ALTER TABLE olts ADD COLUMN longitude NUMERIC(10, 7)`
            },
            {
                name: 'onus.model',
                sql: sql`ALTER TABLE onus ADD COLUMN model TEXT`
            },
            {
                name: 'onus.ssid',
                sql: sql`ALTER TABLE onus ADD COLUMN ssid TEXT`
            },
            {
                name: 'onus.firmware_version',
                sql: sql`ALTER TABLE onus ADD COLUMN firmware_version TEXT`
            },
            {
                name: 'onus.last_down_reason',
                sql: sql`ALTER TABLE onus ADD COLUMN last_down_reason TEXT`
            },
            {
                name: 'onus.connection_type',
                sql: sql`ALTER TABLE onus ADD COLUMN connection_type TEXT DEFAULT 'router'`
            },
            {
                name: 'onus.connected_to_id',
                sql: sql`ALTER TABLE onus ADD COLUMN connected_to_id UUID`
            },
            {
                name: 'onus.waypoints',
                sql: sql`ALTER TABLE onus ADD COLUMN waypoints TEXT`
            },
            {
                name: 'onus.target_interface',
                sql: sql`ALTER TABLE onus ADD COLUMN target_interface TEXT`
            },
            {
                name: 'onus.mac_address',
                sql: sql`ALTER TABLE onus ADD COLUMN mac_address TEXT`
            },
            {
                name: 'routers.last_error_message',
                sql: sql`ALTER TABLE routers ADD COLUMN last_error_message TEXT`
            },
            {
                name: 'users.tenant_id',
                sql: sql`ALTER TABLE users ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'routers.tenant_id',
                sql: sql`ALTER TABLE routers ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'router_groups.tenant_id',
                sql: sql`ALTER TABLE router_groups ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'olts.tenant_id',
                sql: sql`ALTER TABLE olts ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'onus.tenant_id',
                sql: sql`ALTER TABLE onus ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'alerts.tenant_id',
                sql: sql`ALTER TABLE alerts ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'alerts.ai_analysis',
                sql: sql`ALTER TABLE alerts ADD COLUMN ai_analysis TEXT`
            },
            {
                name: 'app_settings.tenant_id',
                sql: sql`ALTER TABLE app_settings ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'audit_logs.tenant_id',
                sql: sql`ALTER TABLE audit_logs ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'router_netwatch.tenant_id',
                sql: sql`ALTER TABLE router_netwatch ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'pppoe_sessions.tenant_id',
                sql: sql`ALTER TABLE pppoe_sessions ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'notification_groups.tenant_id',
                sql: sql`ALTER TABLE notification_groups ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'router_metrics.tenant_id',
                sql: sql`ALTER TABLE router_metrics ADD COLUMN tenant_id UUID REFERENCES tenants(id)`
            },
            {
                name: 'users.ai_enabled',
                sql: sql`ALTER TABLE users ADD COLUMN ai_enabled BOOLEAN DEFAULT false NOT NULL`
            },
            {
                name: 'users.ai_api_key',
                sql: sql`ALTER TABLE users ADD COLUMN ai_api_key TEXT`
            },
            {
                name: 'routers.last_full_sync',
                sql: sql`ALTER TABLE routers ADD COLUMN last_full_sync TIMESTAMP`
            },
            {
                name: 'routers.gateway_id',
                sql: sql`ALTER TABLE routers ADD COLUMN gateway_id UUID REFERENCES routers(id)`
            },
            {
                name: 'routers.romon_mac',
                sql: sql`ALTER TABLE routers ADD COLUMN romon_mac TEXT`
            },
            {
                name: 'routers.last_neighbors_sync',
                sql: sql`ALTER TABLE routers ADD COLUMN last_neighbors_sync TIMESTAMP`
            },
            {
                name: 'topology_nodes.custom_name',
                sql: sql`ALTER TABLE topology_nodes ADD COLUMN IF NOT EXISTS custom_name TEXT`
            },
            {
                name: 'topology_nodes.custom_host',
                sql: sql`ALTER TABLE topology_nodes ADD COLUMN IF NOT EXISTS custom_host TEXT`
            },
            {
                name: 'topology_nodes.custom_type',
                sql: sql`ALTER TABLE topology_nodes ADD COLUMN IF NOT EXISTS custom_type TEXT`
            },
            {
                name: 'topology_links.source_interface',
                sql: sql`ALTER TABLE topology_links ADD COLUMN IF NOT EXISTS source_interface TEXT`
            },
            {
                name: 'topology_links.target_interface',
                sql: sql`ALTER TABLE topology_links ADD COLUMN IF NOT EXISTS target_interface TEXT`
            },
            {
                name: 'topology_links.path_offset',
                sql: sql`ALTER TABLE topology_links ADD COLUMN IF NOT EXISTS path_offset DECIMAL(10, 2) DEFAULT 0`
            },
            {
                name: 'topology_links.animation_type',
                sql: sql`ALTER TABLE topology_links ADD COLUMN IF NOT EXISTS animation_type TEXT DEFAULT 'pulse'`
            },
            {
                name: 'topology_links.source_handle',
                sql: sql`ALTER TABLE topology_links ADD COLUMN IF NOT EXISTS source_handle TEXT`
            },
            {
                name: 'topology_links.target_handle',
                sql: sql`ALTER TABLE topology_links ADD COLUMN IF NOT EXISTS target_handle TEXT`
            },
            {
                name: 'topology_nodes.notes',
                sql: sql`ALTER TABLE topology_nodes ADD COLUMN IF NOT EXISTS notes TEXT`
            },
            {
                name: 'topology_links.notes',
                sql: sql`ALTER TABLE topology_links ADD COLUMN IF NOT EXISTS notes TEXT`
            },
            {
                name: 'router_netwatch.is_app_only',
                sql: sql`ALTER TABLE router_netwatch ADD COLUMN is_app_only BOOLEAN DEFAULT false NOT NULL`
            },
            {
                name: 'router_netwatch.disabled',
                sql: sql`ALTER TABLE router_netwatch ADD COLUMN disabled BOOLEAN DEFAULT false NOT NULL`
            },
            {
                name: 'router_netwatch.has_webhook',
                sql: sql`ALTER TABLE router_netwatch ADD COLUMN has_webhook BOOLEAN DEFAULT false NOT NULL`
            },
            {
                name: 'device_performance_history.host',
                sql: sql`ALTER TABLE device_performance_history ADD COLUMN IF NOT EXISTS host TEXT`
            },
            {
                name: 'device_performance_history.error_message',
                sql: sql`ALTER TABLE device_performance_history ADD COLUMN IF NOT EXISTS error_message TEXT`
            },
            {
                name: 'routers.email_smtp_server',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_server TEXT`
            },
            {
                name: 'routers.email_smtp_port',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_port INTEGER`
            },
            {
                name: 'routers.email_smtp_user',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_user TEXT`
            },
            {
                name: 'routers.email_smtp_pass_encrypted',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_pass_encrypted TEXT`
            },
            {
                name: 'routers.email_smtp_recipient',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_recipient TEXT`
            },
            {
                name: 'routers.email_smtp_interval',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_interval TEXT`
            },
            {
                name: 'routers.email_smtp_start_time',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_start_time TEXT DEFAULT '00:00:00'`
            },
            {
                name: 'routers.email_smtp_export_delay',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_export_delay INTEGER DEFAULT 10`
            },
            {
                name: 'routers.email_smtp_cleanup_delay',
                sql: sql`ALTER TABLE routers ADD COLUMN email_smtp_cleanup_delay INTEGER DEFAULT 30`
            },
        ];

        for (const m of migrations) {
            const [tableName, columnName] = m.name.split('.');
            console.log(`🔎 Checking ${tableName}.${columnName}...`);
            try {
                const check = await db.execute(sql`
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = ${tableName} AND column_name = ${columnName}
                `);

                if (check.length === 0) {
                    console.log(`🚀 Applying migration: ${m.name}`);
                    await db.execute(m.sql);
                    console.log(`✅ Migration applied: ${m.name}`);
                } else {
                    console.log(`⏭️ Migration already applied: ${m.name}`);
                }
            } catch (err) {
                console.error(`❌ Failed to apply migration: ${m.name}`, err);
                logger.warn({ err, migration: m.name }, `Failed to apply optimization/migration for ${m.name}`);
            }
        }
        // Special check: Make topology_nodes.node_id nullable if it exists
        try {
            await db.execute(sql`ALTER TABLE topology_nodes ALTER COLUMN node_id DROP NOT NULL`);
        } catch (e) { /* ignore if column doesn't exist yet or already nullable */ }

        // 3. Ensure unique constraints exist (safe, no data loss)
        const constraintMigrations = [
            {
                name: 'app_settings_tenant_key_unique',
                check: sql`SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_tenant_key_unique'`,
                apply: sql`ALTER TABLE app_settings ADD CONSTRAINT app_settings_tenant_key_unique UNIQUE(tenant_id, key)`,
            },
        ];

        for (const cm of constraintMigrations) {
            try {
                const exists = await db.execute(cm.check);
                if (exists.length === 0) {
                    logger.info(`Applying constraint migration: ${cm.name}`);
                    await db.execute(cm.apply);
                }
            } catch (err) {
                logger.warn({ err, constraint: cm.name }, `Constraint ${cm.name} may already exist or failed to apply`);
            }
        }

        // 4. Post-migration: Setup Default Tenant and Backfill
        try {
            const tenantsCount = await db.execute(sql`SELECT count(*) FROM tenants`);
            const count = parseInt(tenantsCount[0]?.count as string || '0');

            if (count === 0) {
                logger.info('🏢 Initializing Default Tenant...');
                const [defaultTenant] = await db.execute(sql`
                    INSERT INTO tenants (name, slug, description)
                    VALUES ('Main ISP', 'main-isp', 'Default ISP created during Multi-Tenant migration')
                    RETURNING id
                `) as any[];

                if (defaultTenant) {
                    const tenantId = defaultTenant.id;
                    logger.info({ tenantId }, '✅ Default Tenant created. Backfilling existing data...');

                    // Backfill all tables
                    const tablesToBackfill = [
                        'users', 'routers', 'router_groups', 'olts', 'onus',
                        'alerts', 'app_settings', 'audit_logs', 'router_netwatch',
                        'pppoe_sessions', 'notification_groups', 'router_metrics'
                    ];
                    for (const table of tablesToBackfill) {
                        try {
                            await db.execute(sql.raw(`UPDATE ${table} SET tenant_id = '${tenantId}' WHERE tenant_id IS NULL`));
                        } catch (err) {
                            logger.warn({ table, err }, 'Failed to backfill table');
                        }
                    }
                    logger.info('🚀 Backfill complete');
                }
            }
        } catch (err) {
            logger.error({ err }, 'Failed to initialize default tenant');
        }

        logger.info('✅ Database migrations complete');
    } catch (error) {
        logger.warn({ err: error }, 'Migration warning - some changes might already be applied');
    }
}

// Call if run directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runMigrations().catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}
