import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function verify() {
    console.log('--- Verifying Topology Links Columns ---');
    console.log('Database URL:', process.env.DATABASE_URL);

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database.');

        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'topology_links'
        `);

        const columns = res.rows.map(r => r.column_name);
        console.log('Current columns in topology_links:', columns.join(', '));

        const required = ['source_handle', 'target_handle'];
        const missing = required.filter(col => !columns.includes(col));

        if (missing.length === 0) {
            console.log('🎉 All required columns are present.');
        } else {
            console.log('❌ Missing columns:', missing.join(', '));
            console.log('Retrying migration manually...');

            for (const col of missing) {
                console.log(`Adding column: ${col}`);
                await client.query(`ALTER TABLE topology_links ADD COLUMN IF NOT EXISTS ${col} TEXT`);
            }
            console.log('✅ Columns added successfully.');
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
        console.log('--- Verification Finished ---');
    }
}

verify();
