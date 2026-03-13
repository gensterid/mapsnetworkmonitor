
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '..', 'apps', 'api', '.env'), override: true });

async function auditDatabase() {
    // Hardcoded for direct troubleshooting on current environment
    const config = {
        user: 'postgres',
        password: 'admin123',
        host: 'localhost',
        port: 5432,
        database: 'mikrotik_monitor',
    };
    
    console.log(`Connecting to: ${config.host}:${config.port}/${config.database} (User: ${config.user})`);

    const client = new Client(config);
    await client.connect();

    try {
        console.log('--- Database Audit Result ---');

        // 1. Table Sizes
        console.log('\n[1] Table Sizes (Top 10):');
        const tableSizes = await client.query(`
            SELECT
                relname AS table_name,
                pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
                pg_size_pretty(pg_relation_size(relid)) AS table_size,
                pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
            FROM pg_catalog.pg_statio_user_tables
            ORDER BY pg_total_relation_size(relid) DESC
            LIMIT 10;
        `);
        console.table(tableSizes.rows);

        // 2. Dead Tuples (Autovacuum health)
        console.log('\n[2] Dead Tuples (Fragmenation):');
        const deadTuples = await client.query(`
            SELECT
                relname AS table_name,
                n_live_tup AS live_tuples,
                n_dead_tup AS dead_tuples,
                CAST(n_dead_tup AS FLOAT) / NULLIF(n_live_tup, 0) * 100 AS dead_percentage,
                last_autovacuum,
                last_autoanalyze
            FROM pg_stat_user_tables
            ORDER BY n_dead_tup DESC
            LIMIT 10;
        `);
        console.table(deadTuples.rows);

        // 3. Cache Hit Ratio
        console.log('\n[3] Cache Hit Ratio (Ideal > 99%):');
        const cacheHit = await client.query(`
            SELECT
                sum(heap_blks_read) as heap_read,
                sum(heap_blks_hit)  as heap_hit,
                (sum(heap_blks_hit) - sum(heap_blks_read)) / sum(heap_blks_hit) as ratio
            FROM pg_statio_user_tables;
        `);
        console.table(cacheHit.rows);

        // 4. Index Usage (Unused Indexes)
        console.log('\n[4] Index Usage (Unused Indexes):');
        const unusedIndexes = await client.query(`
            SELECT
                s.relname AS table_name,
                s.indexrelname AS index_name,
                s.idx_scan AS times_scanned
            FROM pg_stat_user_indexes s
            JOIN pg_index i ON s.indexrelid = i.indexrelid
            WHERE s.idx_scan = 0 AND i.indisunique = false
            LIMIT 10;
        `);
        console.table(unusedIndexes.rows);

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await client.end();
    }
}

auditDatabase();
