
import 'dotenv/config';
import { auth } from './src/lib/auth';
import { db } from './src/db';
import { users, accounts } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes, scryptSync } from 'crypto';

async function run() {
    const timestamp = Date.now();

    // 1. Create user via Better Auth API (Reference)
    const apiEmail = `api-${timestamp}@example.com`;
    const password = 'password123';

    console.log(`Creating API user ${apiEmail}...`);
    await auth.api.signUpEmail({
        body: {
            email: apiEmail,
            password,
            name: 'API User'
        }
    });

    // 2. Fetch and Compare
    const apiUser = await db.query.users.findFirst({ where: eq(users.email, apiEmail) });
    const apiAccount = await db.query.accounts.findFirst({ where: eq(accounts.userId, apiUser!.id) });

    console.log('\n--- VERIFICATION TEST ---');
    const apiStored = apiAccount?.password || '';
    const [apiSalt, apiHash] = apiStored.split(':');

    console.log('Salt:', apiSalt);
    console.log('Hash (Target):', apiHash);

    // Test 3: Correct Parameters? (N=16384, r=16, p=1)
    // salt is passed as string, keylen 64
    const testHashParams = scryptSync(password, apiSalt, 64, {
        N: 16384,
        r: 16,
        p: 1,
        maxmem: 128 * 16384 * 16 * 2
    }).toString('hex');
    console.log('Test 3 (N=16384, r=16, p=1) match?', testHashParams === apiHash);
    console.log('Hash (Test 3):  ', testHashParams);

    process.exit(0);
}

run();
