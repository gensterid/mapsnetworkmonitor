
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

        console.log('\n--- SYSTEM INFO ---');
        const title = html.match(/<title>(.*?)<\/title>/)?.[1];
        console.log(`Tool: ${title}`);

        // Find scripts with more flexible regex
        const scriptTags = html.match(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/g) || [];
        const linkTags = html.match(/<link\s+[^>]*href=["']([^"']+\.js)["'][^>]*>/g) || [];

        console.log('\n--- DETECTED ASSETS ---');
        const assets = new Set<string>();

        [...scriptTags, ...linkTags].forEach(tag => {
            const match = tag.match(/(src|href)=["']([^"']+)["']/);
            if (match) assets.add(match[2]);
        });

        // Add some common guesses if none found
        if (assets.size === 0) {
            console.log('No scripts found in HTML. Trying common paths...');
            ['/js/app.js', '/js/index.js', '/static/js/app.js', '/js/main.js'].forEach(a => assets.add(a));
        }

        for (const asset of assets) {
            const assetUrl = asset.startsWith('http') ? asset : `${baseUrl}${asset.startsWith('/') ? '' : '/'}${asset}`;
            console.log(`Scanning ${assetUrl}...`);
            try {
                const assetRes = await fetch(assetUrl);
                if (assetRes.ok) {
                    const content = await assetRes.text();
                    console.log(`   [OK] Length: ${content.length}`);

                    // Look for patterns like "ont_info" or "onu_list" or similar
                    const apiMatches = content.match(/\/[\w_]{4,30}(_get|_table|_config|_data|_info|_list)/g);
                    if (apiMatches) {
                        const unique = [...new Set(apiMatches)];
                        console.log(`   [FOUND API ENDPOINTS]: ${unique.join(', ')}`);
                    }

                    // Look for h.cgi modules
                    const modMatches = content.match(/module=([\w_]{4,20})/g);
                    if (modMatches) {
                        const uniqueMods = [...new Set(modMatches.map(m => m.split('=')[1]))];
                        console.log(`   [FOUND MODULES]: ${uniqueMods.join(', ')}`);
                    }
                } else {
                    console.log(`   [FAILED] Status: ${assetRes.status}`);
                }
            } catch (e: any) {
                console.log(`   [ERROR] ${e.message}`);
            }
        }

        console.log('\n--- HTML SCAN FOR HARDCODED PATHS ---');
        const htmlPaths = html.match(/\/[\w_]{4,30}(_get|_table|_config|_data|_info|_list)/g);
        if (htmlPaths) {
            console.log(`Found in HTML: ${[...new Set(htmlPaths)].join(', ')}`);
        } else {
            console.log('No API-like strings found in HTML.');
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

probeHome();
