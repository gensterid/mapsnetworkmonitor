/**
 * Export database to JSON
 * Usage: DATABASE_URL=postgresql://... npx tsx src/scripts/export-json.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import {
    routers,
    users,
    alerts,
    routerNetwatch,
    routerGroups,
    notificationGroups,
    appSettings,
    pppoeSessions
} from '../db/schema/index.js';

async function exportToJson() {
    console.log('=== Exporting Database to JSON ===\n');
    console.log('Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));

    try {
        const data: Record<string, any[]> = {};

        // Export routers
        console.log('Exporting routers...');
        data.routers = await db.select().from(routers);
        console.log(`  Found ${data.routers.length} routers`);

        // Export users
        console.log('Exporting users...');
        data.users = await db.select().from(users);
        console.log(`  Found ${data.users.length} users`);

        // Export router groups
        console.log('Exporting router groups...');
        data.routerGroups = await db.select().from(routerGroups);
        console.log(`  Found ${data.routerGroups.length} router groups`);

        // Export notification groups
        console.log('Exporting notification groups...');
        data.notificationGroups = await db.select().from(notificationGroups);
        console.log(`  Found ${data.notificationGroups.length} notification groups`);

        // Export netwatch
        console.log('Exporting netwatch entries...');
        data.routerNetwatch = await db.select().from(routerNetwatch);
        console.log(`  Found ${data.routerNetwatch.length} netwatch entries`);

        // Export alerts
        console.log('Exporting alerts...');
        data.alerts = await db.select().from(alerts);
        console.log(`  Found ${data.alerts.length} alerts`);

        // Export app settings
        console.log('Exporting app settings...');
        data.appSettings = await db.select().from(appSettings);
        console.log(`  Found ${data.appSettings.length} app settings`);

        // Export PPPoE sessions
        console.log('Exporting PPPoE sessions...');
        data.pppoeSessions = await db.select().from(pppoeSessions);
        console.log(`  Found ${data.pppoeSessions.length} PPPoE sessions`);

        // Save to file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `database-export-${timestamp}.json`;
        const outputPath = path.join(process.cwd(), filename);

        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

        console.log(`\n✅ Export complete!`);
        console.log(`📁 File saved to: ${outputPath}`);

        process.exit(0);
    } catch (error) {
        console.error('Export failed:', error);
        process.exit(1);
    }
}

exportToJson();
