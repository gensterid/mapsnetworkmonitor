
import 'dotenv/config';
import { db } from './src/db/index.js';
import { pppoeSessions } from './src/db/schema/index.js';
import { desc } from 'drizzle-orm';

async function run() {
    try {
        const latest = await db.select().from(pppoeSessions).orderBy(desc(pppoeSessions.lastSeen)).limit(5);
        if (latest.length === 0) {
            console.log('No PPPoE sessions found.');
        } else {
            latest.forEach(s => {
                console.log(`Session: ${s.name}, Last Seen: ${s.lastSeen}, Status: ${s.status}`);
            });
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();
