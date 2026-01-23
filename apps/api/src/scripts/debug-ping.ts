import { config } from 'dotenv';
import path from 'path';
import { eq, ilike } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { routers } from '../db/schema/index.js';
import { connectToRouter, measurePing } from '../lib/mikrotik-api.js';
import { decrypt } from '../lib/encryption.js';

// Load env
const loadEnv = () => {
    let envPath = path.resolve(process.cwd(), '.env');
    config({ path: envPath });
    if (process.env.DATABASE_URL) return;
    envPath = path.resolve(process.cwd(), '../../.env');
    config({ path: envPath });
};
loadEnv();

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found');
    process.exit(1);
}

const run = async () => {
    // Get args
    const args = process.argv.slice(2);
    const hostArg = args.find(a => a.startsWith('host='))?.split('=')[1];
    const routerArg = args.find(a => a.startsWith('router='))?.split('=')[1] || 'genster';

    if (!hostArg) {
        console.log('Usage: npx tsx src/scripts/debug-ping.ts host=192.168.0.200 router=genster');
        process.exit(1);
    }

    console.log(`Searching for router matching "${routerArg}"...`);

    const queryClient = postgres(process.env.DATABASE_URL!);
    const db = drizzle(queryClient);

    const [router] = await db
        .select()
        .from(routers)
        .where(ilike(routers.name, `%${routerArg}%`))
        .limit(1);

    if (!router) {
        console.error('Router not found.');
        process.exit(1);
    }

    console.log(`Found router: ${router.name} (${router.host})`);

    try {
        const password = decrypt(router.passwordEncrypted);
        console.log('Connecting to router...');
        const api = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password,
        });
        console.log('Connected.');

        console.log(`Pinging ${hostArg} (count=3)...`);

        // Manual raw ping to see output
        const result = await api.write([
            '/ping',
            `=address=${hostArg}`,
            '=count=3'
        ]);

        console.log('--- RAW RESULT ---');
        console.log(JSON.stringify(result, null, 2));
        console.log('------------------');

        // Test the parser logic
        console.log('Testing measurePing parser...');
        const parsed = await measurePing(api, hostArg); // This runs another ping, but we can't easily mock api here without refactor
        // Actually measurePing runs its own ping.
        // Let's just manually run the logic on the RAW RESULT we just got.

        console.log('Parsing analysis:');
        for (const entry of result) {
            const time = entry['time'];
            console.log(`Packet time raw: "${time}" (${typeof time})`);

            // Replicate parseLatencyValue logic
            const str = String(time).trim().toLowerCase();
            let parsedVal: number = -999;

            if (str.includes('us')) {
                const us = parseFloat(str.replace('us', ''));
                parsedVal = Math.max(1, Math.round(us / 1000));
            } else if (str.endsWith('s') && !str.includes('ms')) {
                const s = parseFloat(str.replace('s', ''));
                parsedVal = Math.round(s * 1000);
            } else if (str.includes('ms')) {
                parsedVal = Math.round(parseFloat(str.replace('ms', '')));
            } else {
                const num = parseFloat(str);
                parsedVal = isNaN(num) ? -1 : Math.round(num);
            }
            console.log(`  -> parseLatencyValue("${time}") = ${parsedVal}`);
        }

        api.close();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

run();
