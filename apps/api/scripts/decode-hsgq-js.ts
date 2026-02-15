
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';

async function decodeJS() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ JS Decoder for OLT ${oltId} ---`);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) return;

        const baseUrl = `${olt.webProtocol || 'http'}://${olt.host}:${olt.webPort}`;
        const targetJS = `${baseUrl}/js/main-page.a1cb2cd1.js`;

        console.log(`Fetching ${targetJS}...`);
        const res = await fetch(targetJS);
        if (!res.ok) {
            console.error(`Failed to fetch JS: ${res.status}`);
            return;
        }

        const content = await res.text();
        console.log(`Downloaded ${content.length} characters.`);

        // 1. Search for function calls that use gponont or ontinfo
        console.log('\n--- SEARCHING FOR ONU LIST FETCHING LOGIC ---');
        const searchTerms = ['/gponont', '/ontinfo', '/onu_info', 'refreshData', 'postData', 'getData'];

        for (const term of searchTerms) {
            const idx = content.indexOf(term);
            if (idx !== -1) {
                console.log(`\nContext for "${term}":`);
                console.log(content.substring(Math.max(0, idx - 150), Math.min(content.length, idx + 400)));
            }
        }

        // 2. Search for ALL strings starting with / and containing ont or onu
        console.log('\n--- EXTRACTING ALL /...ont/onu... STRINGS ---');
        const pathMatches = content.match(/\/[\w_\-\?\&\%=]{4,60}/g);
        if (pathMatches) {
            const filtered = pathMatches.filter(p => p.includes('ont') || p.includes('onu') || p.includes('mgmt') || p.includes('table'));
            console.log('Detected Paths:', [...new Set(filtered)].join(', '));
        }

        // 3. Search for header injection
        console.log('\n--- SEARCHING FOR CUSTOM HEADERS ---');
        const headerMatches = content.match(/headers\s*:\s*\{[^}]+\}/g);
        if (headerMatches) {
            console.log('Potential Headers found (First 3):', headerMatches.slice(0, 3));
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

decodeJS();
