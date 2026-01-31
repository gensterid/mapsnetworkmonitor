
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Polyfill require
const require = createRequire(import.meta.url);

// Load .env explicitly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

console.log('Loading modules...');
// Import from dist
import { db } from './dist/db/index.js';
import { connectToRouter, measurePing } from './dist/lib/mikrotik-api.js';
import { decrypt } from './dist/lib/encryption.js';

async function debugPing() {
    console.log('Starting debug...');

    // Explicit list of target
    const targetHost = '119.235.113.226';

    try {
        console.log('Fetching router...');
        // Get the first router
        const router = await db.query.routers.findFirst();

        if (!router) {
            console.error('No router found in DB');
            process.exit(1);
        }

        console.log(`Using router: ${router.name} (${router.host})`);

        let password = router.passwordEncrypted;
        try {
            password = decrypt(router.passwordEncrypted);
            console.log('Password decrypted successfully');
        } catch (e) {
            console.warn('Decryption failed, using as is:', e.message);
        }

        console.log('Connecting to router...');
        const conn = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: password,
            timeout: 10
        });

        console.log(`Connected. Pinging ${targetHost}...`);

        // Use 5 pings for better sample
        const result = await measurePing(conn, targetHost, 5, '100ms', '1000ms');

        console.log('Ping Result:', JSON.stringify(result, null, 2));

        if (result.latency === -1) {
            console.error('Ping FAILED (Latency -1). This explains why it is empty in UI.');
        } else {
            console.log('Ping SUCCESS. UI should show:', result.latency + 'ms');
        }

        conn.close();
    } catch (e) {
        console.error('Error during debug:', e);
    }
    process.exit(0);
}

debugPing().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
