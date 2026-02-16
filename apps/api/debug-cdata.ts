import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { olts } from './src/db/schema/olts.js';
import { eq } from 'drizzle-orm';
import { decrypt } from './src/lib/encryption.js';

async function debugCData() {
    const oltId = '63bfb5eb-33bd-4622-a633-e90d2f7f754c';
    const sql = postgres(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) throw new Error('OLT not found');

        let realPassword = 'N/A';
        if (olt.webPassword) {
            let currentPassword = olt.webPassword;
            while (currentPassword && currentPassword.includes(':') && currentPassword.split(':').length === 4) {
                try {
                    currentPassword = decrypt(currentPassword);
                } catch (e) { break; }
            }
            realPassword = currentPassword;
        }

        const uname = olt.webUsername || 'admin';
        const protocol = olt.webProtocol || 'http';
        const baseUrl = `${protocol}://${olt.host}:${olt.webPort}`;

        console.log(`C-Data OLT: ${olt.name}`);
        console.log(`Base URL: ${baseUrl}`);
        console.log(`User: ${uname}, Pass: ${realPassword}`);

        // Try to fetch root page to see headers/cookies
        console.log('Fetching root page...');
        const response = await fetch(baseUrl);
        console.log(`Status: ${response.status}`);
        console.log(`Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
        const text = await response.text();
        console.log(`Body Sample: ${text.substring(0, 500)}`);

    } catch (error: any) {
        console.error('Debug failed:', error.message);
    } finally {
        await sql.end();
    }
}

debugCData();
