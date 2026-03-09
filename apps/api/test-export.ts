import { RouterOSAPI } from 'node-routeros';
import { db } from './src/db/index';
import { routers } from './src/db/schema';
import { decrypt } from './src/lib/encryption';

async function testExport() {
    console.log('Fetching a router from DB...');
    const routerList = await db.select().from(routers).limit(1);
    const router = routerList[0];
    
    console.log(`Testing against ${router.host}...`);
    const conn = new RouterOSAPI({
        host: router.host,
        port: router.port,
        user: router.username,
        password: decrypt(router.passwordEncrypted),
        timeout: 30
    });

    try {
        await conn.connect();
        console.log('Connected! Generating test file...');
        await conn.write(['/export', '=file=test_api_read.rsc']);
        
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('Reading file contents...');
        const res = await conn.write(['/file/print', '=detail=', '?name=test_api_read.rsc']);
        console.log('Result type:', typeof res);
        console.log('Result length:', Array.isArray(res) ? res.length : 'not array');
        if (Array.isArray(res) && res.length > 0) {
            console.log('File attributes:', Object.keys(res[0]));
            if (res[0].contents) {
                console.log('Contents length:', res[0].contents.length);
                console.log('Contents sample:', res[0].contents.substring(0, 100));
            } else {
                console.log('NO CONTENTS FIELD RETURNED');
            }
        }
    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        conn.close();
        process.exit(0);
    }
}

testExport();
