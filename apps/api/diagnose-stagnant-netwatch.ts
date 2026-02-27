import { db } from './src/db/index.js';
import { routerNetwatch } from './src/db/schema/index.js';
import { routers } from './src/db/schema/routers.js';
import { eq, lt, sql } from 'drizzle-orm';

async function main() {
    try {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - 1);

        console.log(`Checking for Netwatch entries stagnant since before ${cutoff.toISOString()}...`);

        const stagnantEntries = await db
            .select({
                host: routerNetwatch.host,
                name: routerNetwatch.name,
                lastCheck: routerNetwatch.lastCheck,
                routerName: routers.name,
                routerId: routers.id,
                routerStatus: routers.status,
                routerUpdatedAt: routers.updatedAt
            })
            .from(routerNetwatch)
            .leftJoin(routers, eq(routerNetwatch.routerId, routers.id))
            .where(lt(routerNetwatch.lastCheck, cutoff))
            .limit(50);

        if (stagnantEntries.length === 0) {
            console.log('No stagnant entries found (checks > 1 hour ago).');
        } else {
            console.log(`Found ${stagnantEntries.length} stagnant entries (sample):`);
            stagnantEntries.forEach(e => {
                console.log(`Host: ${e.host}, Name: ${e.name}, LastCheck: ${e.lastCheck}`);
                console.log(`  Router: ${e.routerName} (${e.routerId}), Status: ${e.routerStatus}, RouterUpdate: ${e.routerUpdatedAt}`);
                console.log('---');
            });
        }

        const counts = await db
            .select({
                routerName: routers.name,
                stagnantCount: sql<number>`count(*)`.mapWith(Number)
            })
            .from(routerNetwatch)
            .leftJoin(routers, eq(routerNetwatch.routerId, routers.id))
            .where(lt(routerNetwatch.lastCheck, cutoff))
            .groupBy(routers.name);

        console.log('\nStagnant Summary by Router:');
        counts.forEach(c => {
            console.log(`${c.routerName}: ${c.stagnantCount} entries stagnant`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Diagnostic failed:', err);
        process.exit(1);
    }
}

main();
