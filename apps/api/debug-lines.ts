
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { routerNetwatch, routers } from './src/db/schema';
import { eq, or, ilike, inArray } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mikrotik_monitor';
const queryClient = postgres(connectionString);
const db = drizzle(queryClient);

async function main() {
    console.log('Connecting to DB...');

    try {
        // 1. Find the key devices
        const names = ['MERLIN', 'ONI', 'JELY', 'merlin 10:90', 'PUNCAK'];

        console.log('\n--- Checking Routers ---');
        const routerResults = await db.select().from(routers).where(
            or(
                ...names.map(name => ilike(routers.name, `%${name}%`)),
                ...names.map(name => ilike(routers.identity, `%${name}%`))
            )
        );
        routerResults.forEach(r => {
            console.log(`[ROUTER] Name: ${r.name}, ID: ${r.id}, Identity: ${r.identity}`);
        });

        console.log('\n--- Checking Netwatch Devices ---');
        const netwatchResults = await db.select().from(routerNetwatch).where(
            or(
                ...names.map(name => ilike(routerNetwatch.name, `%${name}%`)),
                ...names.map(name => ilike(routerNetwatch.host, `%${name}%`)) // Some might use host/comment as name
            )
        );

        const deviceMap = new Map();
        netwatchResults.forEach(n => {
            console.log(`[NETWATCH] Name: ${n.name}, ID: ${n.id}, Type: ${n.deviceType}, ConnectionType: ${n.connectionType}, ConnectedToId: ${n.connectedToId}`);
            console.log(`           Coordinates: ${n.latitude}, ${n.longitude}`);
            deviceMap.set(n.id, n);
        });

        console.log('\n--- Analyzing Relationships ---');
        netwatchResults.forEach(n => {
            if (n.connectedToId) {
                console.log(`Device "${n.name}" (${n.id}) connects to: ${n.connectedToId}`);

                // Check if parent is in netwatch
                const parentNetwatch = deviceMap.get(n.connectedToId) || netwatchResults.find(x => x.id === n.connectedToId);
                if (parentNetwatch) {
                    console.log(`  -> Connected to Netwatch Device: "${parentNetwatch.name}"`);
                    if (!parentNetwatch.latitude || !parentNetwatch.longitude) {
                        console.error(`  [CRITICAL] Parent Netwatch Device "${parentNetwatch.name}" HAS NO COORDINATES! Check Map logic requires coords.`);
                    } else {
                        console.log(`  [OK] Parent has coordinates.`);
                    }
                } else {
                    // Check if parent is router
                    const parentRouter = routerResults.find(r => r.id === n.connectedToId);
                    if (parentRouter) {
                        console.log(`  -> Connected to Router: "${parentRouter.name}"`);
                        if (!parentRouter.latitude || !parentRouter.longitude) {
                            console.error(`  [CRITICAL] Parent Router "${parentRouter.name}" HAS NO COORDINATES!`);
                        }
                    } else {
                        console.log(`  -> !!! PARENT NOT FOUND IN RESULT SET (Could be a router or device not in filter) !!!`);
                        console.log(`  -> Querying specifically for parent ID: ${n.connectedToId}`);
                    }
                }
            } else {
                console.log(`Device "${n.name}" has NO connectedToId.`);
            }
        });

        // 2. Deep check for orphans
        for (const n of netwatchResults) {
            if (n.connectedToId) {
                const existsInNetwatch = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, n.connectedToId));
                const existsInRouter = await db.select().from(routers).where(eq(routers.id, n.connectedToId));

                if (existsInNetwatch.length === 0 && existsInRouter.length === 0) {
                    console.error(`  [ERROR] Parent ID ${n.connectedToId} does not exist in netwatch or routers table!`);
                } else if (existsInNetwatch.length > 0) {
                    console.log(`  [VERIFIED] Parent is Netwatch: ${existsInNetwatch[0].name}`);
                    if (n.connectionType !== 'client') {
                        console.warn(`  [WARNING] Device ${n.name} connects to another Netwatch device but connectionType is '${n.connectionType}' (Expected 'client')`);
                    }
                } else if (existsInRouter.length > 0) {
                    console.log(`  [VERIFIED] Parent is Router: ${existsInRouter[0].name}`);
                    if (n.connectionType !== 'router') {
                        console.warn(`  [WARNING] Device ${n.name} connects to a Router but connectionType is '${n.connectionType}' (Expected 'router')`);
                    }
                }
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

main();
