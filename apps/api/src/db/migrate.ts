import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { logger } from '../lib/logger.js';

export async function runMigrations() {
    try {
        await db.execute(sql`
            DO $$
            BEGIN
                -- Alerts escalation
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'escalation_level') THEN
                    ALTER TABLE alerts ADD COLUMN escalation_level INTEGER DEFAULT 0 NOT NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'last_escalated_at') THEN
                    ALTER TABLE alerts ADD COLUMN last_escalated_at TIMESTAMP;
                END IF;

                -- PPPoE coordinates
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pppoe_sessions' AND column_name = 'latitude') THEN
                    ALTER TABLE pppoe_sessions ADD COLUMN latitude TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pppoe_sessions' AND column_name = 'longitude') THEN
                    ALTER TABLE pppoe_sessions ADD COLUMN longitude TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pppoe_sessions' AND column_name = 'waypoints') THEN
                    ALTER TABLE pppoe_sessions ADD COLUMN waypoints TEXT;
                END IF;

                -- User preferences
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'timezone') THEN
                    ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Asia/Jakarta' NOT NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'animation_style') THEN
                    ALTER TABLE users ADD COLUMN animation_style TEXT DEFAULT 'default';
                END IF;

                -- Netwatch traffic
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'router_netwatch' AND column_name = 'target_interface') THEN
                    ALTER TABLE router_netwatch ADD COLUMN target_interface TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'router_netwatch' AND column_name = 'tx_rate') THEN
                    ALTER TABLE router_netwatch ADD COLUMN tx_rate BIGINT DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'router_netwatch' AND column_name = 'rx_rate') THEN
                    ALTER TABLE router_netwatch ADD COLUMN rx_rate BIGINT DEFAULT 0;
                END IF;

                -- GenieACS integration
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'routers' AND column_name = 'use_genieacs') THEN
                    ALTER TABLE routers ADD COLUMN use_genieacs BOOLEAN DEFAULT false NOT NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'routers' AND column_name = 'genieacs_url') THEN
                    ALTER TABLE routers ADD COLUMN genieacs_url TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'routers' AND column_name = 'genieacs_username') THEN
                    ALTER TABLE routers ADD COLUMN genieacs_username TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'routers' AND column_name = 'genieacs_password_encrypted') THEN
                    ALTER TABLE routers ADD COLUMN genieacs_password_encrypted TEXT;
                END IF;

                -- OLT status and location
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'olts' AND column_name = 'last_snmp_status') THEN
                    ALTER TABLE olts ADD COLUMN last_snmp_status TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'olts' AND column_name = 'last_web_status') THEN
                    ALTER TABLE olts ADD COLUMN last_web_status TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'olts' AND column_name = 'latitude') THEN
                    ALTER TABLE olts ADD COLUMN latitude NUMERIC(10, 7);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'olts' AND column_name = 'longitude') THEN
                    ALTER TABLE olts ADD COLUMN longitude NUMERIC(10, 7);
                END IF;
            END $$;
        `);
        logger.info('✅ Database migrations complete');
    } catch (error) {
        logger.warn({ err: error }, 'Migration warning - some changes might already be applied');
    }
}
