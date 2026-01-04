import { db } from '../db';
import { routerNetwatch, routers } from '../db/schema';
import { notInArray, sql } from 'drizzle-orm';

async function main() {
    console.log('Cleaning up orphaned router_netwatch records...');

    // Raw SQL is often more reliable for this specific "not in" scenario across tables
    // especially if schema definitions usually imply constraints that we are currently fighting
    try {
        await db.execute(sql`DELETE FROM "router_netwatch" WHERE "router_id" NOT IN (SELECT "id" FROM "routers")`);
        console.log('Cleanup complete.');
    } catch (e) {
        console.error('Error during cleanup:', e);
    }
    process.exit(0);
}

main();
