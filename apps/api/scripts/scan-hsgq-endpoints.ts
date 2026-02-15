
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

async function scanEndpoints() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ SNIPER Scanner for OLT ${oltId} ---`);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) return;

        const baseUrl = `${olt.webProtocol || 'http'}://${olt.host}:${olt.webPort}`;
        const uname = olt.webUsername || 'admin';
        const password = olt.webPassword ? decrypt(olt.webPassword) : 'admin';

        // 1. Login
        const key = crypto.createHash('md5').update(`${uname}:${password}`).digest('hex');
        const value = Buffer.from(password).toString('base64');
        const payload = {
            method: "set",
            param: { name: uname, key: key, value: value, captcha_v: "", captcha_f: "" }
        };

        const loginRes = await fetch(`${baseUrl}/userlogin?form=login`, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });

        const token = loginRes.headers.get('x-token') || loginRes.headers.get('token');
        if (!token) {
            console.log('Login failed (no token)');
            return;
        }

        console.log('Login success. Starting Sniper probe on JS hints...');

        // 2. Focused Targets from JS Probe
        const targets = [
            '/gponont',
            '/gpon_ont',
            '/ontinfo_table',
            '/onu_basic_info',
            '/ontautofind_table',
            '/pon_mac_table',
            '/system_running_config',
            '/board_info' // Known Success
        ];

        const methods = ['GET', 'POST'];

        for (const path of targets) {
            for (const method of methods) {
                console.log(`--- Testing [${method}] ${path} ---`);

                const options: any = {
                    method,
                    headers: {
                        'x-token': token,
                        'token': token,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                    }
                };

                if (method === 'POST') {
                    options.body = JSON.stringify({ method: "get", param: {} });
                    options.headers['Content-Type'] = 'application/json';
                }

                try {
                    const res = await fetch(`${baseUrl}${path}`, options);
                    if (res.ok) {
                        const data = await res.json().catch(() => null);
                        if (data) {
                            console.log(`🌟 SUCCESS! Code: ${data.code}, Message: ${data.message}`);
                            if (data.data) {
                                const count = Array.isArray(data.data) ? data.data.length : (data.data.list ? data.data.list.length : 'Object');
                                console.log(`   Items found: ${count}`);
                                if (count > 0) {
                                    console.log(`   Sample: ${JSON.stringify(data.data).substring(0, 200)}...`);
                                }
                            }
                        } else {
                            console.log(`OK (${res.status}) but not JSON`);
                        }
                    } else {
                        console.log(`Failed: ${res.status}`);
                    }
                } catch (e: any) {
                    console.log(`Error: ${e.message}`);
                }
            }
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

scanEndpoints();
