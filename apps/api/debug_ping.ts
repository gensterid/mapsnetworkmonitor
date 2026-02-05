
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './src/db/index.js';
import { connectToRouter, measurePing } from './src/lib/mikrotik-api.js';
import { decrypt } from './src/lib/encryption.js';

// Load .env explicitly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

async function debugPing() {
    console.error('DEBUG: Starting script...');

    // Explicit list of target
    const targetHost = '119.235.113.226';
    const controlHost = '8.8.8.8';

    try {
        console.error('DEBUG: Fetching router...');
        const router = await db.query.routers.findFirst();

        if (!router) {
            console.error('DEBUG: No router found in DB');
            process.exit(1);
        }

        console.error(`DEBUG: Using router: ${router.name} (${router.host})`);

        let password = router.passwordEncrypted;
        try {
            password = decrypt(router.passwordEncrypted);
            console.error('DEBUG: Password decrypted');
        } catch (e: any) {
            console.error('DEBUG: Decryption failed:', e?.message || e);
        }

        console.error('DEBUG: Connecting to router...');
        const conn = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: password,
            timeout: 10
        });

        console.error(`DEBUG: Connected. Pinging Control ${controlHost}...`);
        const resultControl = await measurePing(conn, controlHost, 3);
        console.error('DEBUG: Control Result:', JSON.stringify(resultControl));

        console.error(`DEBUG: Pinging Target ${targetHost}...`);
        const resultTarget = await measurePing(conn, targetHost, 3);
        console.error('DEBUG: Target Result:', JSON.stringify(resultTarget));

        conn.close();
    } catch (e: any) {
        console.error('DEBUG: Error:', e?.message || e);
    }
    process.exit(0);
}

debugPing();
