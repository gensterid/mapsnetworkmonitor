
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust env loading
const searchPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'apps', 'api', '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
    path.join(__dirname, '..', '..', '..', '..', '.env'),
];

for (const p of searchPaths) {
    dotenv.config({ path: p });
    if (process.env.DATABASE_URL) {
        console.log(`✅ Loaded env from: ${p}`);
        break;
    }
}

async function checkDuplicates() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        process.exit(1);
    }

    const queryClient = postgres(connectionString);
    const db = drizzle(queryClient);

    try {
        console.log('🔍 Checking for Netwatch/Topology Duplicates...');

        // 1. Find potential duplicates in router_netwatch (matching by host or case-insensitive name)
        const netwatchDupes = await db.execute(sql.raw(`
            SELECT lower(name) as low_name, host, router_id, count(*) 
            FROM router_netwatch 
            GROUP BY low_name, host, router_id 
            HAVING count(*) > 1;
        `));
        console.log('\n--- Netwatch Duplicates (Casing/Host) ---');
        console.table(netwatchDupes);

        // 2. Sample of duplicated records
        if (netwatchDupes.length > 0) {
            const sample = await db.execute(sql.raw(`
                SELECT id, name, host, is_app_only, router_id 
                FROM router_netwatch 
                WHERE lower(name) = '${netwatchDupes[0].low_name}' 
                LIMIT 10;
            `));
            console.log('\n--- Sample of Duplicated Records ---');
            console.table(sample);
        }

    } catch (err) {
        console.error('❌ Duplicate check failed:', err);
    } finally {
        await queryClient.end();
    }
}

checkDuplicates();
