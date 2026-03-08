import { connectToRouter, safeWrite } from '../apps/api/src/lib/mikrotik-api.js';
import { decrypt } from '../apps/api/src/lib/encryption.js';
import { db } from '../apps/api/src/db/index.js';
import { routers } from '../apps/api/src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

async function diagFetchParams(routerId: string) {
    const router = await db.query.routers.findFirst({
        where: eq(routers.id, routerId)
    });

    if (!router) {
        console.error('Router not found');
        return;
    }

    console.log(`Testing fetch params for router: ${router.name} (${router.host})`);
    
    try {
        const conn = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: decrypt(router.passwordEncrypted)
        });

        const testUrl = 'https://google.com';

        // Helper to test a set of parameters
        const testSet = async (name: string, params: string[]) => {
            console.log(`--- Testing: ${name} ---`);
            console.log('Params:', params);
            try {
                await safeWrite(conn, ['/tool/fetch', ...params], 10000);
                console.log(`✅ ${name} supported`);
            } catch (err: any) {
                console.error(`❌ ${name} failed:`, err.message);
            }
        };

        await testSet('Basic (url only)', [`=url=${testUrl}`, '=keep-result=no']);
        await testSet('With http-method', [`=url=${testUrl}`, '=http-method=post', '=keep-result=no']);
        await testSet('With check-certificate', [`=url=${testUrl}`, '=check-certificate=no', '=keep-result=no']);
        await testSet('With mode', [`=url=${testUrl}`, '=mode=https', '=keep-result=no']);
        await testSet('With timeout', [`=url=${testUrl}`, '=timeout=30', '=keep-result=no']);
        await testSet('With src-path', [`=url=${testUrl}`, '=src-path=non-existent-file', '=keep-result=no']);

        conn.close();
    } catch (err: any) {
        console.error('General error:', err.message);
    }
}

const routerId = process.argv[2];
if (!routerId) {
    console.log('Usage: npx tsx scripts/diag-fetch-params.ts <router-id>');
} else {
    diagFetchParams(routerId).then(() => process.exit());
}
