
import { routerService } from '../services/router.service';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { alerts } from '../db/schema';

// Hardcoded router ID from previous step output (Manual insertion needed if I can't read stdout automatically easily yet, wait I can read command status)
// Actually I'll query it again here to be safe and self-contained.

async function debugPoll() {
    console.log('--- START DEBUG POLL ---');
    const router = await db.query.routers.findFirst({
        where: (routers, { like }) => like(routers.name, '%genster%')
    });

    if (!router) {
        console.error('Router not found');
        return;
    }

    console.log(`Polling router: ${router.name} (${router.id})`);

    // Force full sync to ensure netwatch is checked
    try {
        console.log('Calling refreshRouterStatus...');
        await routerService.refreshRouterStatus(router.id, true, true);
        console.log('Refresh compeleted.');
    } catch (e) {
        console.error('Refresh failed:', e);
    }

    // Check recent alerts for this router
    const recentAlerts = await db.select().from(alerts)
        .where(eq(alerts.routerId, router.id))
        .orderBy(desc(alerts.createdAt))
        .limit(5);

    console.log('--- Recent Alerts ---');
    recentAlerts.forEach(a => {
        console.log(`[${a.createdAt.toISOString()}] Type: ${a.type} | Resolved: ${a.resolved} | Title: ${a.title}`);
    });
    console.log('--- END DEBUG POLL ---');
    process.exit(0);
}

// Need to import desc for query
import { desc } from 'drizzle-orm';

debugPoll();
