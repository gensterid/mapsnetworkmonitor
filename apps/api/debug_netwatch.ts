
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env explicitly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

import { db } from './src/db/index.js';
import { routerNetwatch } from './src/db/schema/index.js';
import { desc } from 'drizzle-orm';

async function checkRecentNetwatch() {
    console.log('Checking recent netwatch entries...');
    try {
        const entries = await db
            .select()
            .from(routerNetwatch)
            .orderBy(desc(routerNetwatch.createdAt))
            .limit(5);

        console.log('Most recent 5 Netwatch entries:');
        entries.forEach(e => {
            console.log(`ID: ${e.id}, Host: ${e.host}, Name: ${e.name}, Status: ${e.status}, Latency: ${e.latency}, LastKnown: ${e.lastKnownLatency}, Created: ${e.createdAt}`);
        });
    } catch (err) {
        console.error('Error querying DB:', err);
    }

    process.exit(0);
}

checkRecentNetwatch();
