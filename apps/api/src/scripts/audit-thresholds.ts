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
    const unresolvedResult = await db.select({ count: count() }).from(alerts).where(eq(alerts.resolved, false));
    
    console.log(`Total Alerts: ${totalResult[0].count}`);
    console.log(`Unresolved Alerts: ${unresolvedResult[0].count}`);

    // Break down by type using Drizzle select for better compatibility
    console.log('\nUnresolved Breakdown (Top Categories):');
    const alertsList = await db.select({
        type: alerts.type,
        severity: alerts.severity
    })
    .from(alerts)
    .where(eq(alerts.resolved, false));

    const breakdown: Record<string, number> = {};
    alertsList.forEach(a => {
        const key = `${a.type} (${a.severity})`;
        breakdown[key] = (breakdown[key] || 0) + 1;
    });

    Object.entries(breakdown).forEach(([key, val]) => {
        const typeOnly = key.split(' ')[0];
        const category = ISSUE_TYPES.includes(typeOnly) ? 'ISSUE' : (CONNECTIVITY_TYPES.includes(typeOnly) ? 'CONNECTIVITY' : 'OTHER');
        console.log(`- [${category}] ${key}: ${val}`);
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
