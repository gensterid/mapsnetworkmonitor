
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

async function scanEndpoints() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ X-RAY Scanner for OLT ${oltId} ---`);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) return;

        const protocol = olt.webProtocol || 'http';
        const baseUrl = `${protocol}://${olt.host}:${olt.webPort}`;
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
            headers: { 'Content-Type': 'application/json' }
        });

        const token = loginRes.headers.get('x-token') || loginRes.headers.get('token');
        if (!token) return;

        console.log('Login success. Starting X-Ray probe...');

        // 2. Target Modules & Files
        const modules = [
            'ont_info', 'ontinfo', 'onu_info', 'onuinfo', 'gponont', 'eponont',
            'ont_table', 'onu_table', 'ont_list', 'onu_list', 'ont_status', 'onu_status',
            'ont_cfg', 'ont_config', 'ont_data', 'ont_state', 'ont_link'
        ];

        const staticFiles = [
            '/js/app.js', '/js/main.js', '/js/index.js', '/js/config.js', '/js/data.js'
        ];

        console.log('\n--- Probing h.cgi Modules (GET) ---');
        for (const mod of modules) {
            const url = `${baseUrl}/cgi-bin/h.cgi?module=${mod}_get`;
            process.stdout.write(`Testing ${mod}_get... `);
            const res = await fetch(url, { headers: { 'x-token': token } });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                if (data && data.code === 1) console.log(`🌟 SUCCESS! code 1`);
                else console.log(`OK (${res.status}) but code ${data?.code}`);
            } else {
                console.log(res.status);
            }
        }

        console.log('\n--- Probing Direct Endpoints (GET) ---');
        const direct = [
            '/ont_info_get', '/ont_info_data', '/ont_status_get', '/ont_table_get',
            '/gponont_info', '/eponont_info', '/ont_info_config', '/api/gpon/ont/list'
        ];
        for (const path of direct) {
            process.stdout.write(`Testing ${path}... `);
            const res = await fetch(`${baseUrl}${path}`, { headers: { 'x-token': token } });
            console.log(res.status);
        }

        console.log('\n--- Probing Static JS for Clues ---');
        for (const file of staticFiles) {
            process.stdout.write(`Checking ${file}... `);
            const res = await fetch(`${baseUrl}${file}`);
            if (res.ok) {
                const text = await res.text();
                const matches = text.match(/\/[\w_]{4,20}(_table|_info|_list|_config|_get)/g);
                if (matches) {
                    console.log(`FOUND PATHS: ${[...new Set(matches)].join(', ')}`);
                } else {
                    console.log('OK (Found file but no path indicators)');
                }
            } else {
                console.log(res.status);
            }
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

scanEndpoints();
