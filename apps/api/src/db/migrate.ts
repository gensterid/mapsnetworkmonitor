import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { logger } from '../lib/logger.js';

export async function runMigrations() {
    try {
        console.log('🔄 Checking core database schema...');

        // 1. Ensure user_role enum exists
        try {
            await db.execute(sql`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'operator', 'user'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
        } catch (e) { /* ignore if already exists */ }

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
        ];

        for (const m of migrations) {
            const [tableName, columnName] = m.name.split('.');
            try {
                const check = await db.execute(sql`
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = ${tableName} AND column_name = ${columnName}
                `);

                if (check.length === 0) {
                    logger.info(`Applying migration: ${m.name}`);
                    await db.execute(m.sql);
                }
            } catch (err) {
                logger.warn({ err, migration: m.name }, `Failed to apply optimization/migration for ${m.name}`);
            }
        }

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
