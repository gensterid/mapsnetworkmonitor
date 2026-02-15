
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';

async function probeHome() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- HSGQ "Deep Sea" Probe for OLT ${oltId} ---`);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) return;

        const baseUrl = `${olt.webProtocol || 'http'}://${olt.host}:${olt.webPort}`;

        console.log(`Fetching root page from ${baseUrl}...`);
        const res = await fetch(baseUrl);
        const html = await res.text();

        console.log('\n--- HEADERS ---');
        console.log(JSON.stringify([...res.headers.entries()]));

        console.log('\n--- HTML SNIPPET (First 2000 chars) ---');
        console.log(html.substring(0, 2000));

        // Let's also try common asset paths that usually hold the "real" API endpoints
        const sources = html.match(/src="[^"]+"/g) || [];
        console.log('\n--- DETECTED SCRIPTS ---');
        sources.forEach(src => console.log(src));

    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

probeHome();
