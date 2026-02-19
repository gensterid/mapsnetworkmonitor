import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { logger } from '../lib/logger.js';

export async function runMigrations() {
    try {
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
