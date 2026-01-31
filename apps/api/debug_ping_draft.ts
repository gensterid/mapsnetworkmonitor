
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { measurePing, connectToRouter } from './src/lib/mikrotik-api.js';

// Load .env explicitly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

async function debugPing() {
    const targetHost = '119.235.113.226';
    console.log(`Debugging ping for host: ${targetHost}`);

    // Get the first router (assuming valid one exists)
    const router = await db.query.routers.findFirst();

    if (!router) {
        console.error('No router found in DB');
        return;
    }

    console.log(`Using router: ${router.name} (${router.host})`);

    try {
        const conn = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: router.passwordEncrypted, // Note: In real app this is decrypted!
            // Wait, in database it's encrypted. I need to decrypt it or use a known password?
            // checking router.service.ts... it uses findByIdWithPassword which handles decryption?
            // No, findByIdWithPassword decrypts it.
            // I need to decrypt it here or use the service.
        });

        // Actually, let's just use routerService if possible, or copy decryption logic.
        // For simplicity, I'll rely on the fact that I might not be able to decrypt easily without the key.
        // I will interpret the 'passwordEncrypted' as plain text if ENCRYPTION_KEY is not set or something?
        // Let's import the encryption utility.
    } catch (e) {
        // ...
    }
}
// check encryption.ts
