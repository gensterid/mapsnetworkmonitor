
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

async function scanEndpoints() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ Endpoint Scanner for OLT ${oltId} ---`);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) {
            console.error('OLT not found in database');
            return;
        }

        const protocol = olt.webProtocol || 'http';
        const baseUrl = `${protocol}://${olt.host}:${olt.webPort}`;
        const uname = olt.webUsername || 'admin';
        const password = olt.webPassword ? decrypt(olt.webPassword) : 'admin';

        console.log(`Target: ${baseUrl}`);
        console.log(`User: ${uname}`);

        // 1. Login
        const key = crypto.createHash('md5').update(`${uname}:${password}`).digest('hex');
        const value = Buffer.from(password).toString('base64');
        const payload = {
            method: "set",
            param: { name: uname, key: key, value: value, captcha_v: "", captcha_f: "" }
        };

        console.log('Attempting login...');
        const loginRes = await fetch(`${baseUrl}/userlogin?form=login`, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!loginRes.ok) {
            console.error(`Login failed with status ${loginRes.status}`);
            return;
        }

        const loginData = await loginRes.json() as any;
        if (loginData.code !== 1) {
            console.error('Login rejected:', loginData.message);
            return;
        }

        const token = loginRes.headers.get('x-token');
        if (!token) {
            console.error('No x-token found in response headers');
            return;
        }

        console.log('Login successful! Token obtained.');

        // 2. Scan Endpoints
        const endpoints = [
            '/ontinfo_table',
            '/ontinfo_config',
            '/ontinfo_data',
            '/ont_info',
            '/ont_status_table',
            '/ont_list',
            '/api/onu/list',
            '/get_onu_info',
            '/ont_info_table',
            '/all_onu_info',
            '/ontinfo',
            '/onu_list_table'
        ];

        console.log('\nScanning potential endpoints...');

        for (const endpoint of endpoints) {
            process.stdout.write(`Testing ${endpoint}... `);
            try {
                const res = await fetch(`${baseUrl}${endpoint}`, {
                    headers: { 'x-token': token }
                });

                if (res.ok) {
                    const data = await res.json().catch(() => null);
                    if (data) {
                        console.log(`SUCCESS! JSON returned. (Code: ${data.code}, Items: ${data.data?.length || '?'})`);
                    } else {
                        console.log('SUCCESS! (But empty or invalid JSON)');
                    }
                } else {
                    console.log(`Failed (${res.status})`);
                }
            } catch (e: any) {
                console.log(`Error: ${e.message}`);
            }
        }

    } catch (error) {
        console.error('Scanner error:', error);
    }

    process.exit(0);
}

scanEndpoints();
