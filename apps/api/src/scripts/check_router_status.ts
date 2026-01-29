
import 'dotenv/config';
import { db } from '../db/index.js';
import { routers } from '../db/schema/index.js';
import { desc } from 'drizzle-orm';
import fs from 'fs';

async function checkRouters() {
    console.log('Checking Router Status...');

    const allRouters = await db
        .select()
        .from(routers)
        .orderBy(desc(routers.updatedAt));

    const output = [];
    output.push(`Found ${allRouters.length} routers.`);

    if (allRouters.length > 0) {
        output.push('--- Router Types & Status ---');
        allRouters.forEach(r => {
            output.push(`[${r.updatedAt}] ${r.name} (${r.host}) - Status: ${r.status}, LastSeen: ${r.lastSeen}`);
        });
    }

    fs.writeFileSync('router_status.txt', output.join('\n'));
    console.log('Done');
    process.exit(0);
}

checkRouters();
