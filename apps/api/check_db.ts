
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './src/db/schema/index';
// Note: importing pppoeSessions directly for query
import { pppoeSessions } from './src/db/schema/index';
// import { eq, isNotNull } from 'drizzle-orm';

const connectionString = 'postgresql://postgres:postgres@localhost:5432/mikrotik_monitor';
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

async function check() {
    try {
        const sessions = await db.select().from(pppoeSessions);
        console.log(`Total sessions: ${sessions.length}`);

        const disconnected = sessions.filter(s => s.status === 'disconnected');
        console.log(`Disconnected sessions: ${disconnected.length}`);

        disconnected.forEach(s => {
            console.log(`- ${s.name}: Lat=${s.latitude}, Lng=${s.longitude}, Status=${s.status}`);
        });

        const withCoords = sessions.filter(s => s.latitude && s.longitude);
        console.log(`Sessions with coords: ${withCoords.length}`);

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

check();
