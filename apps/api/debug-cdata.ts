import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { olts } from './src/db/schema/olts.js';
import { eq } from 'drizzle-orm';
import { decrypt } from './src/lib/encryption.js';

import crypto from 'crypto';

async function debugCData() {
    const oltId = '63bfb5eb-33bd-4622-a633-e90d2f7f754c';
    const sql = postgres(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) throw new Error('OLT not found');

        let password = decrypt(olt.webPassword!);
        const protocol = olt.webProtocol || 'http';
        const baseUrl = `${protocol}://${olt.host}:${olt.webPort}`;

        console.log(`Probing OLT: ${olt.name} at ${baseUrl}`);

        // Login
        const md5Password = crypto.createHash('md5').update(password).digest('hex');
        const loginUrl = `${baseUrl}/cgi-bin/h.cgi?module=sys_login`;
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            body: JSON.stringify({ Usrname: olt.webUsername, Password: md5Password }),
            headers: { 'Content-Type': 'application/json' }
        });
        const loginData = await loginRes.json() as any;
        console.log('Login Result:', JSON.stringify(loginData));
        console.log('Login Headers:', JSON.stringify(Object.fromEntries(loginRes.headers.entries())));

        if (loginData.code !== 0) throw new Error('Login failed');
        const token = loginData.data?.token || loginData.token;

        console.log('--- Verifying CDataDriver ---');
        const { CDataDriver } = await import('./src/services/olt-drivers/cdata.driver.js');
        const driver = new CDataDriver({
            host: olt.host,
            port: olt.webPort || 80,
            username: olt.webUsername || 'admin',
            password: password,
            protocol: olt.webProtocol || 'http'
        });

        await driver.connect();
        const driverOnus = await driver.getOnuList();
        console.log(`Driver Results (total ${driverOnus.length}):`);
        driverOnus.slice(0, 10).forEach(o => {
            console.log(`SN: ${o.sn}, Status: ${o.status}, Signal: ${o.signal}`);
        });
        await driver.disconnect();

    } catch (error: any) {
        console.error('Debug failed:', error.message);
    } finally {
        await sql.end();
    }
}

debugCData();
