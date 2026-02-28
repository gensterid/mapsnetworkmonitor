import { db } from './src/db/index.js';
import { routers } from './src/db/schema/index.js';
import { eq, or, like } from 'drizzle-orm';

async function checkRouter() {
    console.log('--- Checking FZ Network Status ---');
    const result = await db.select().from(routers).where(
        or(
            like(routers.name, '%FZ Network%'),
            like(routers.host, '%id.genster.net%')
        )
    );

    if (result.length === 0) {
        console.log('Router not found in DB');
    } else {
        result.forEach(r => {
            console.log(`ID: ${r.id}`);
            console.log(`Name: ${r.name}`);
            console.log(`Host: ${r.host}`);
            console.log(`Port: ${r.port}`);
            console.log(`Status: ${r.status}`);
            console.log(`Latency: ${r.latency}`);
            console.log(`Last Seen: ${r.lastSeen}`);
            console.log(`Last Error: ${r.lastErrorMessage}`);
            console.log(`Updated At: ${r.updatedAt}`);
            console.log('---');
        });
    }
    process.exit(0);
}

checkRouter().catch(err => {
    console.error(err);
    process.exit(1);
});
