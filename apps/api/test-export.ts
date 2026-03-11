import { RouterOSAPI } from 'node-routeros';
import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { decrypt } from './src/lib/encryption.js';

async function run() {
    try {
        const routerList = await db.query.routers.findMany({ limit: 1 });
        const router = routerList[0];
        if (!router) return console.log('No router found');

        console.log(`Connecting to ${router.host}:${router.port}...`);
        const conn = new RouterOSAPI({
            host: router.host,
            user: router.username,
            port: router.port,
            password: decrypt(router.passwordEncrypted),
            timeout: 10
        });

        await conn.connect();
        console.log('Connected! Executing /export...');

        // In RouterOS API, /export outputs lines. Often they come back in the 'message' or 'data' fields
        const res = await conn.write('/export').catch(e => {
            console.error('Export command error:', e.message);
            return null;
        });

        if (res) {
            console.log('Export command returned type:', typeof res);
            if (Array.isArray(res)) {
                console.log(`Array length: ${res.length}`);
                if (res.length > 0) {
                    console.log('First item keys:', Object.keys(res[0]));
                    console.log('Sample entry:', JSON.stringify(res[0]).substring(0, 150));
                }
            } else {
                console.log('Result:', JSON.stringify(res).substring(0, 150));
            }
        }
        
        conn.close();
    } catch (e: any) {
        console.error('Global Error:', e.message);
    } finally {
        process.exit(0);
    }
}
run();
