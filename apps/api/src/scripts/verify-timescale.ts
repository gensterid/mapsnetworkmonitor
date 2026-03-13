
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '..', 'apps', 'api', '.env') });

async function verifyTimescale() {
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
        console.log('--- Phase 4: Verification ---');

        // 1. Check Hypertables
        const hypertables = await client.query("SELECT hypertable_name FROM timescaledb_information.hypertables");
        console.log('\nHypertables found:');
        hypertables.rows.forEach(row => console.log(`- ${row.hypertable_name}`));

        // 2. Check Compression Policies
        const policies = await client.query("SELECT hypertable_name, job_interval FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression'");
        console.log('\nCompression Policies:');
        policies.rows.forEach(row => console.log(`- ${row.hypertable_name}: ${row.job_interval}`));

        // 3. Check Compression Stats
        console.log('\nCompression Stats:');
        for (const row of hypertables.rows) {
            const stats = await client.query(`SELECT * FROM hypertable_compression_stats('${row.hypertable_name}')`);
            if (stats.rows.length > 0) {
                const s = stats.rows[0];
                console.log(`- ${row.hypertable_name}: Before=${s.before_compression_bytes} After=${s.after_compression_bytes} (Saved: ${s.before_compression_bytes - s.after_compression_bytes} bytes)`);
            } else {
                console.log(`- ${row.hypertable_name}: No compression stats yet (data might be < 7 days old)`);
            }
        }

        console.log('\n✅ Verification Complete.');

    } catch (err: any) {
        console.error('❌ Verification Failed:', err.message);
    } finally {
        await client.end();
    }
}

verifyTimescale();
