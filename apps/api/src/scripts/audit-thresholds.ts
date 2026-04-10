import { db } from '../db/index.js';
import { appSettings, alerts, routers } from '../db/schema/index.js';
import { eq, count } from 'drizzle-orm';
import { ISSUE_TYPES, CONNECTIVITY_TYPES } from '../services/alert-core.service.js';

async function runCheck() {
    console.log('🔍 Starting Alert System Diagnostic...');
    
    // 1. Check App Settings for Alerts
    console.log('\n--- 1. App Settings (Thresholds) ---');
    const settings = await db.select().from(appSettings);
    const settingsMap: Record<string, any> = {};
    settings.forEach(s => settingsMap[s.key] = s.value);
    
    const relevantKeys = [
        'alertsEnabled', 
        'highCpuAlerts', 
        'highMemoryAlerts', 
        'alertThresholdCpuWarning', 
        'alertThresholdMemoryWarning'
    ];
    
    relevantKeys.forEach(key => {
        console.log(`${key}: ${settingsMap[key] ?? 'DEFAULT (MISSING)'}`);
    });

    // 2. Check current alert counts in DB
    console.log('\n--- 2. Database Alert Counts ---');
    const totalResult = await db.select({ count: count() }).from(alerts);
    const issueResult = await db.select({ count: count() }).from(alerts).where(eq(alerts.resolved, false));
    
    console.log(`Total Alerts: ${totalResult[0].count}`);
    console.log(`Unresolved Alerts: ${issueResult[0].count}`);

    // Break down by type
    const statsResult = await db.execute('SELECT type, severity, count(*) FROM alerts WHERE resolved = false GROUP BY type, severity');
    console.log('\nUnresolved Breakdown:');
    (statsResult as any).rows.forEach((r: any) => {
        const category = ISSUE_TYPES.includes(r.type) ? 'ISSUE' : (CONNECTIVITY_TYPES.includes(r.type) ? 'CONNECTIVITY' : 'OTHER');
        console.log(`- [${category}] ${r.type} (${r.severity}): ${r.count}`);
    });

    // 3. Check Router Sync Status
    console.log('\n--- 3. Router Sync Health ---');
    const routerList = await db.select({ 
        name: routers.name, 
        lastFullSync: routers.lastFullSync, 
        status: routers.status 
    }).from(routers);
    
    routerList.forEach(r => {
        const timeDiff = r.lastFullSync ? Math.round((Date.now() - new Date(r.lastFullSync).getTime()) / 1000 / 60) : 'NEVER';
        console.log(`- ${r.name}: ${r.status} (Last Full Sync: ${timeDiff} mins ago)`);
    });

    process.exit(0);
}

runCheck().catch(err => {
    console.error('Diagnostic Failed:', err);
    process.exit(1);
});
