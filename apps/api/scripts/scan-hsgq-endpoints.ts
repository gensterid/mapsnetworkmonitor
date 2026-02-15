
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

async function scanEndpoints() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ Ultra Scanner for OLT ${oltId} ---`);

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
        console.log('Login Response Body:', JSON.stringify(loginData));

        const token = loginRes.headers.get('x-token') || loginRes.headers.get('token');
        if (!token) {
            console.error('No token found in response headers. Headers found:', JSON.stringify([...loginRes.headers.entries()]));
            return;
        }

        console.log('Login successful! Token obtained:', token.substring(0, 10) + '...');

        // 2. Scan Endpoints
        const endpoints = [
            // Modern
            '/ontinfo_table',
            '/ontinfo_config',
            '/ont_status_table',
            '/ont_stat_table',
            '/ont_optical_table',
            '/ont_link_table',
            '/ontinfo_data',
            '/ontinfo_list',
            '/onu_list_table',
            '/ont_info_table',
            '/api/onu/list',

            // EPON Specific
            '/epon_onu_info',
            '/epon_onu_table',
            '/epon_ont_table',

            // CGI Prefixed
            '/cgi-bin/ontinfo_table',
            '/cgi-bin/v2/get_onu_info.cgi',
            '/cgi-bin/v2/get_onu_list.cgi',
            '/cgi-bin/get_onu_info.cgi',
            '/cgi-bin/index.cgi?module=onu_list',

            // Other variants
            '/get_onu_info',
            '/all_onu_info',
            '/ontinfo',
            '/ont_total_info',
            '/ontlink_table'
        ];

        console.log('\nScanning potential endpoints...');

        const testHeaders = [
            { 'x-token': token },
            { 'token': token },
            { 'Authorization': `Bearer ${token}` }
        ];

        for (const endpoint of endpoints) {
            for (const headers of testHeaders) {
                const headerName = Object.keys(headers)[0];
                process.stdout.write(`Testing ${endpoint} with ${headerName}... `);
                try {
                    const res = await fetch(`${baseUrl}${endpoint}`, { headers });

                    if (res.ok) {
                        const text = await res.text();
                        try {
                            const data = JSON.parse(text);
                            console.log(`\n✅ SUCCESS! ${endpoint} (${headerName})`);
                            console.log(`   Response: Code=${data.code}, Items=${data.data?.length || data.info?.length || data.list?.length || '?'}`);
                            console.log(`   Sample: ${JSON.stringify(data).substring(0, 150)}...\n`);
                        } catch (e) {
                            console.log(`PARTIAL (OK but not JSON). Preview: ${text.substring(0, 50)}...`);
                        }
                    } else {
                        process.stdout.write(`${res.status} `);
                        if (headerName === 'Authorization') console.log(''); // New line after last header attempt
                    }
                } catch (e: any) {
                    console.log(`Error: ${e.message}`);
                }
            }
        }

    } catch (error) {
        console.error('Scanner error:', error);
    }

    process.exit(0);
}

scanEndpoints();
