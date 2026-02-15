
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

async function scanEndpoints() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ OMEGA Scanner for OLT ${oltId} ---`);

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
        const token = loginRes.headers.get('x-token') || loginRes.headers.get('token');
        if (!token) {
            console.error('No token found in response headers.');
            return;
        }

        console.log('Login successful! Token obtained.');

        // 2. Comprehensive Scan List
        const endpoints = [
            // Standard HSGQ GPON/EPON
            '/ontinfo_table', '/ontinfo_config', '/ontinfo_data', '/ontinfo_list',
            '/gponont_table', '/eponont_table', '/gpon_ont_table', '/epon_onu_table',
            '/ont_status_table', '/ont_info_table', '/ont_stat_table', '/ont_list_table',
            '/ontlink_table', '/ont_optical_table', '/ont_info', '/onu_list',

            // Variants (no underscore)
            '/ontinfotable', '/ontinfoconfig', '/ontstatus', '/onulist',

            // V-Sol / Rebranded patterns
            '/api/ont/list', '/api/onu/list', '/api/gpon/ont_list', '/api/epon/onu_list',
            '/api/onu_list', '/api/ont_list',

            // CGI & Module patterns
            '/cgi-bin/h.cgi?module=onu_list_get',
            '/cgi-bin/h.cgi?module=ont_info_get',
            '/cgi-bin/h.cgi?module=onu_status',
            '/cgi-bin/index.cgi?module=onu_list',
            '/cgi-bin/v2/get_onu_info.cgi',
            '/cgi-bin/v2/get_ont_info.cgi',

            // Board/Port level (sometimes needed)
            '/board_info', '/port_info', '/onu_info',

            // Misc
            '/get_onu_info', '/get_ont_info', '/all_onu_info', '/all_ont_info'
        ];

        console.log(`\nScanning ${endpoints.length} potential endpoints with multiple methods...`);

        const methods = ['GET', 'POST'];
        const testHeaders = [
            { 'x-token': token },
            { 'token': token }
        ];

        for (const endpoint of endpoints) {
            for (const method of methods) {
                // For POST, we try with an empty object payload which is common for these APIs
                const fetchOptions: any = {
                    method: method,
                    headers: {}
                };
                if (method === 'POST') {
                    fetchOptions.body = JSON.stringify({ method: "get", param: {} });
                    fetchOptions.headers['Content-Type'] = 'application/json';
                }

                for (const headers of testHeaders) {
                    const headerName = Object.keys(headers)[0];
                    const fullHeaders = { ...fetchOptions.headers, ...headers };

                    try {
                        const res = await fetch(`${baseUrl}${endpoint}`, { ...fetchOptions, headers: fullHeaders });

                        if (res.ok) {
                            const text = await res.text();
                            if (text.length > 5 && (text.startsWith('{') || text.startsWith('['))) {
                                try {
                                    const data = JSON.parse(text);
                                    console.log(`\n🌟 SUCCESS! [${method}] ${endpoint} (${headerName})`);
                                    console.log(`   Data Preview: ${JSON.stringify(data).substring(0, 200)}...`);
                                    console.log(`   Keep this endpoint! It works.\n`);
                                    // continue to find more if any
                                } catch (e) {
                                    // Ignore parse errors if it wasn't valid JSON after all
                                }
                            }
                        }
                    } catch (e: any) {
                        // Ignore connection errors during scan
                    }
                }
            }
            process.stdout.write('.'); // Progress indicator
        }
        console.log('\n\nScan complete.');

    } catch (error) {
        console.error('Scanner error:', error);
    }

    process.exit(0);
}

scanEndpoints();
