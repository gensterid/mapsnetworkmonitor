import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { eq, count } from 'drizzle-orm';

async function check() {
    console.log('--- Unresolved Alerts Summary ---');
    const unresolved = await db
        .select()
        .from(alerts)
        .where(eq(alerts.resolved, false));

    console.log(`Total Unresolved: ${unresolved.length}`);

    const typesMap: Record<string, number> = {};
    unresolved.forEach(a => {
        typesMap[a.type] = (typesMap[a.type] || 0) + 1;
    });

    console.log('\nBy Type:');
    Object.entries(typesMap).forEach(([type, count]) => {
        console.log(`${type}: ${count}`);
    });

    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
