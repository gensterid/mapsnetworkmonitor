
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

        // 1. Find potential duplicates in router_netwatch (matching by lower name ONLY, ignoring host)
        const nameDupes = await db.execute(sql.raw(`
            SELECT lower(name) as low_name, router_id, count(*) as count
            FROM router_netwatch 
            WHERE name IS NOT NULL AND name != ''
            GROUP BY low_name, router_id 
            HAVING count(*) > 1;
        `));
        console.log('\n--- Netwatch Duplicates (By Name ONLY) ---');
        console.table(nameDupes);

        // 2. Find duplicates by Coordinates
        const coordDupes = await db.execute(sql.raw(`
            SELECT latitude, longitude, router_id, count(*) as count
            FROM router_netwatch 
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            GROUP BY latitude, longitude, router_id 
            HAVING count(*) > 1;
        `));
        console.log('\n--- Netwatch Duplicates (By Coordinates) ---');
        console.table(coordDupes);

        // 3. Sample of potential collisions
        if (nameDupes.length > 0) {
            console.log('\n--- Investigation Sample ---');
            for (const dupe of nameDupes.slice(0, 3)) {
                console.log(`\nItems for name: "${dupe.low_name}"`);
                const items = await db.execute(sql.raw(`
                    SELECT id, name, host, is_app_only, latitude, longitude
                    FROM router_netwatch 
                    WHERE lower(name) = '${dupe.low_name}' AND router_id = '${dupe.router_id}';
                `));
                console.table(items);
            }
        }

    } catch (err) {
        console.error('❌ Duplicate check failed:', err);
    } finally {
        await queryClient.end();
    }
}

checkDuplicates();
