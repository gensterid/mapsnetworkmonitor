
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

async function scanSequence() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ SEQUENCE SNIPER for OLT ${oltId} ---`);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) return;

        const baseUrl = `${olt.webProtocol || 'http'}://${olt.host}:${olt.webPort}`;
        const uname = olt.webUsername || 'admin';
        const password = olt.webPassword ? decrypt(olt.webPassword) : 'admin';

        // 1. Login
        console.log('Logging in...');
        const key = crypto.createHash('md5').update(`${uname}:${password}`).digest('hex');
        const value = Buffer.from(password).toString('base64');

        const loginRes = await fetch(`${baseUrl}/userlogin?form=login`, {
            method: 'POST',
            body: JSON.stringify({ method: "set", param: { name: uname, key, value, captcha_v: "", captcha_f: "" } }),
            headers: { 'Content-Type': 'application/json' }
        });

        const token = loginRes.headers.get('x-token');
        if (!token) {
            console.log('Login failed');
            return;
        }
        console.log('Login success.');

        // 2. The Auth Sequence (From JS clues)
        // Sequence: /gponont_mgmt?form=auth&port_id=0 -> /ontinfo_table
        console.log('\nStep 1: Calling Auth for Port 0...');
        const authRes = await fetch(`${baseUrl}/gponont_mgmt?form=auth&port_id=0`, {
            headers: { 'x-token': token }
        });

        if (authRes.ok) {
            const authData = await authRes.json() as any;
            console.log(`Step 1 Success! Code: ${authData.code}`);

            console.log('\nStep 2: Calling /ontinfo_table...');
            const tableRes = await fetch(`${baseUrl}/ontinfo_table`, {
                headers: { 'x-token': token }
            });

            if (tableRes.ok) {
                const tableData = await tableRes.json() as any;
                console.log(`🌟 STEP 2 SUCCESS! Code: ${tableData.code}`);
                if (tableData.data) {
                    console.log(`Found ${tableData.data.length} ONUs in table!`);
                    console.log('Sample ONU ID:', tableData.data[0]?.identifier);
                }
            } else {
                console.log(`Step 2 Failed: ${tableRes.status}`);
            }

            console.log('\nStep 2 Alt: Calling /ontautofind_table...');
            const autoRes = await fetch(`${baseUrl}/ontautofind_table`, {
                headers: { 'x-token': token }
            });
            if (autoRes.ok) console.log('Step 2 Alt Success (ontautofind)');

        } else {
            console.log(`Step 1 Failed: ${authRes.status}`);
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

scanSequence();
