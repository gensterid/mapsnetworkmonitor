
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

        // 1. Search for function calls that use gponont
        console.log('\n--- SEARCHING CONTEXT FOR /gponont ---');
        const index = content.indexOf('/gponont');
        if (index !== -1) {
            console.log('Context (Nearby 500 chars):');
            console.log(content.substring(Math.max(0, index - 250), Math.min(content.length, index + 500)));
        } else {
            console.log('"/gponont" not found as a literal string. Searching for variables...');
            // Maybe it's constructed?
        }

        // 2. Search for common axios/fetch config or base URL
        console.log('\n--- SEARCHING FOR baseURL OR api prefix ---');
        const baseMatches = content.match(/baseURL\s*:\s*["']([^"']+)["']/g);
        if (baseMatches) {
            console.log('Potential BaseURLs found:', baseMatches);
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
