import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function main() {
    console.log('Checking router_interfaces rates...');
    try {
        const { db } = await import('../db');
        const { routerInterfaces } = await import('../db/schema');

        const results = await db.select().from(routerInterfaces).limit(20);
        console.log(`Found ${results.length} interfaces.`);
        results.forEach(r => {
            console.log(`Interface: ${r.name}, TX Rate: ${r.txRate}, RX Rate: ${r.rxRate}, Speed: ${r.speed}`);
        });
    } catch (error) {
        console.error('Query failed:', error);
    }
    process.exit(0);
}

main();
