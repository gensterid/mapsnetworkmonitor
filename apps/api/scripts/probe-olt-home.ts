
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';

async function probeHome() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ "X-RAY" Deep Probe for OLT ${oltId} ---`);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) return;

        const baseUrl = `${olt.webProtocol || 'http'}://${olt.host}:${olt.webPort}`;

        console.log(`Fetching root page from ${baseUrl}...`);
        const res = await fetch(baseUrl);
        const html = await res.text();

        console.log('\n--- HEADERS ---');
        console.log(JSON.stringify([...res.headers.entries()], null, 2));

        // Let's find ALL .js and .css files in the entire HTML
        const assets = html.match(/[\/a-zA-Z0-9_\-\.]+\.(js|css)/g) || [];
        const uniqueAssets = [...new Set(assets)];

        console.log('\n--- ALL DETECTED ASSETS (Found ${uniqueAssets.length}) ---');
        uniqueAssets.forEach(asset => {
            if (asset.startsWith('/')) console.log(`   ${asset}`);
            else console.log(`   (Relative) ${asset}`);
        });

        // Try to fetch the most likely candidates
        for (const asset of uniqueAssets) {
            const url = asset.startsWith('http') ? asset : `${baseUrl}${asset.startsWith('/') ? '' : '/'}${asset}`;
            if (asset.includes('.js')) {
                console.log(`\nScanning JS: ${url}`);
                try {
                    const jsRes = await fetch(url);
                    if (jsRes.ok) {
                        const content = await jsRes.text();
                        console.log(`   [OK] Length: ${content.length}`);
                        // Look for API endpoints in the JS content
                        const apiMatches = content.match(/\/[\w_]{4,40}(_get|_table|_config|_data|_info|_list|onu|ont)/g);
                        if (apiMatches) {
                            console.log(`   [FOUND API HINTS]: ${[...new Set(apiMatches)].slice(0, 5).join(', ')}...`);
                        }
                    } else {
                        console.log(`   [FAILED] Status: ${jsRes.status}`);
                    }
                } catch (e) {
                    console.log(`   [ERROR] Connection failed`);
                }
            }
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

probeHome();
