
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '..', 'apps', 'api', '.env') });

async function applyIndices() {
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
        console.log('Applying combined indices for performance...');
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS router_metrics_combined_idx ON router_metrics (router_id, recorded_at DESC);
        `);
        console.log('Index created: router_metrics_combined_idx');

        await client.query(`
            CREATE INDEX IF NOT EXISTS dev_perf_combined_idx ON device_performance_history (router_id, recorded_at DESC);
        `);
        console.log('Index created: dev_perf_combined_idx');

        console.log('✅ Indices applied successfully.');
    } catch (err) {
        console.error('Failed to apply indices:', err);
    } finally {
        await client.end();
    }
}

applyIndices();
