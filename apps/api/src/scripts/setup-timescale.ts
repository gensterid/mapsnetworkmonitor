
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '..', 'apps', 'api', '.env') });

async function setupTimescale() {
    const config = {
        user: 'postgres',
        password: 'admin123',
        host: 'localhost',
        port: 5432,
        database: 'mikrotik_monitor',
    };
    
    const client = new Client(config);
    await client.connect();

    try {
        console.log('--- Phase 3: TimescaleDB Setup ---');

        // 1. Check if extension core is installed
        const extCheck = await client.query("SELECT * FROM pg_extension WHERE extname = 'timescaledb'");
        if (extCheck.rows.length === 0) {
            console.log('❌ Extension "timescaledb" not found. Please ensure Phase 2 (Installation) is complete.');
            return;
        }
        console.log('✅ TimescaleDB extension detected.');

        // 2. Convert to Hypertables (with data migration)
        console.log('Converting tables to Hypertables...');
        await client.query("SELECT create_hypertable('router_metrics', 'recorded_at', if_not_exists => TRUE, migrate_data => TRUE);");
        console.log('✅ router_metrics is now a Hypertable.');

        await client.query("SELECT create_hypertable('device_performance_history', 'recorded_at', if_not_exists => TRUE, migrate_data => TRUE);");
        console.log('✅ device_performance_history is now a Hypertable.');

        // 3. Setup Compression Policy
        console.log('Configuring compression policies (7 days)...');
        
        await client.query(`
            ALTER TABLE router_metrics SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'router_id'
            );
        `);
        await client.query("SELECT add_compression_policy('router_metrics', INTERVAL '7 days', if_not_exists => TRUE);");
        console.log('✅ Compression enabled for router_metrics.');

        await client.query(`
            ALTER TABLE device_performance_history SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'router_id'
            );
        `);
        await client.query("SELECT add_compression_policy('device_performance_history', INTERVAL '7 days', if_not_exists => TRUE);");
        console.log('✅ Compression enabled for device_performance_history.');

        console.log('\n🚀 Phase 3 Complete! Your database is now optimized for long-term storage.');

    } catch (err: any) {
        console.error('❌ Phase 3 Failed:', err.message);
    } finally {
        await client.end();
    }
}

setupTimescale();
