import { db } from './src/db/index.js';
import { routers } from './src/db/schema/routers.js';

async function main() {
    try {
        const allRouters = await db.select().from(routers);
        console.log('--- Router Settings ---');
        allRouters.forEach(r => {
            console.log(`ID: ${r.id}`);
            console.log(`Name: ${r.name}`);
            console.log(`Use GenieACS: ${r.useGenieAcs}`);
            console.log(`GenieACS URL: ${r.genieacsUrl}`);
            console.log('-----------------------');
        });
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();
