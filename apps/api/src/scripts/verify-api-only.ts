import { connectToRouter, getRouterInterfaces } from '../lib/mikrotik-api';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function main() {
    console.log('Verifying mikrotik-api.ts isolated...');

    // Hardcoded credentials for testing (or use env if available, assuming valid env)
    // Actually, I can't hardcode easily. I'll read DB manually? 
    // Or just try to compile this file to see if types are OK.

    // Let's try to assume we have a router in DB and use 'pg' or just 'drizzle' to get it.
    // We can import 'db' from '../db'.
    try {
        const { db } = await import('../db');
        const { routers } = await import('../db/schema');

        const allRouters = await db.select().from(routers).limit(1);
        if (allRouters.length === 0) {
            console.log("No routers in DB.");
            return;
        }

        const router = allRouters[0];
        console.log(`Connecting to ${router.host}...`);

        // We need to decrypt password but let's assume I can get it or verify compilation first.
        // Importing encryption lib.
        const { decrypt } = await import('../lib/encryption');
        const password = decrypt(router.passwordEncrypted);

        const api = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: password,
        });

        console.log("Connected.");
        const interfaces = await getRouterInterfaces(api);
        console.log(`Interfaces: ${interfaces.length}`);

        if (interfaces.length > 0) {
            const first = interfaces[0];
            console.log(`First interface: ${first.name} Speed: ${first.speed}`);
        }

        api.close();

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
