/**
 * Import database from JSON with date handling
 * Usage: npx tsx src/scripts/import-json.ts <path-to-json-file>
 */
import 'dotenv/config';
import fs from 'fs';
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

// Convert date strings to Date objects
function convertDates(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
        // Check if it looks like a date string
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(obj)) {
            return new Date(obj);
        }
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(convertDates);
    }

    if (typeof obj === 'object') {
        const converted: any = {};
        for (const key of Object.keys(obj)) {
            converted[key] = convertDates(obj[key]);
        }
        return converted;
    }

    return obj;
}

async function importFromJson() {
    const jsonPath = process.argv[2];

    if (!jsonPath) {
        console.error('Usage: npx tsx src/scripts/import-json.ts <path-to-json-file>');
        process.exit(1);
    }

    if (!fs.existsSync(jsonPath)) {
        console.error(`File not found: ${jsonPath}`);
        process.exit(1);
    }

    console.log('=== Importing Database from JSON ===\n');
    console.log('Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
    console.log('Import file:', jsonPath);

    try {
        const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const data = convertDates(rawData);

        // Import router groups first (dependency)
        if (data.routerGroups?.length > 0) {
            console.log(`\nImporting ${data.routerGroups.length} router groups...`);
            for (const item of data.routerGroups) {
                try {
                    await db.insert(routerGroups).values(item).onConflictDoNothing();
                } catch (e: any) {
                    console.warn(`  Skip group ${item.name}: ${e.message?.substring(0, 50)}`);
                }
            }
            console.log('  ✅ Done');
        }

        // Import notification groups (dependency)
        if (data.notificationGroups?.length > 0) {
            console.log(`\nImporting ${data.notificationGroups.length} notification groups...`);
            for (const item of data.notificationGroups) {
                try {
                    await db.insert(notificationGroups).values(item).onConflictDoNothing();
                } catch (e: any) {
                    console.warn(`  Skip notification group ${item.name}: ${e.message?.substring(0, 50)}`);
                }
            }
            console.log('  ✅ Done');
        }

        // Import users
        if (data.users?.length > 0) {
            console.log(`\nImporting ${data.users.length} users...`);
            for (const item of data.users) {
                try {
                    await db.insert(users).values(item).onConflictDoNothing();
                } catch (e: any) {
                    console.warn(`  Skip user ${item.email}: ${e.message?.substring(0, 50)}`);
                }
            }
            console.log('  ✅ Done');
        }

        // Import routers
        if (data.routers?.length > 0) {
            console.log(`\nImporting ${data.routers.length} routers...`);
            for (const item of data.routers) {
                try {
                    await db.insert(routers).values(item).onConflictDoNothing();
                } catch (e: any) {
                    console.warn(`  Skip router ${item.name}: ${e.message?.substring(0, 50)}`);
                }
            }
            console.log('  ✅ Done');
        }

        // Import netwatch
        if (data.routerNetwatch?.length > 0) {
            console.log(`\nImporting ${data.routerNetwatch.length} netwatch entries...`);
            for (const item of data.routerNetwatch) {
                try {
                    await db.insert(routerNetwatch).values(item).onConflictDoNothing();
                } catch (e: any) {
                    console.warn(`  Skip netwatch ${item.host}: ${e.message?.substring(0, 50)}`);
                }
            }
            console.log('  ✅ Done');
        }

        // Import alerts
        if (data.alerts?.length > 0) {
            console.log(`\nImporting ${data.alerts.length} alerts...`);
            for (const item of data.alerts) {
                try {
                    await db.insert(alerts).values(item).onConflictDoNothing();
                } catch (e: any) {
                    console.warn(`  Skip alert: ${e.message?.substring(0, 50)}`);
                }
            }
            console.log('  ✅ Done');
        }

        // Import app settings
        if (data.appSettings?.length > 0) {
            console.log(`\nImporting ${data.appSettings.length} app settings...`);
            for (const item of data.appSettings) {
                try {
                    await db.insert(appSettings).values(item).onConflictDoNothing();
                } catch (e: any) {
                    console.warn(`  Skip setting ${item.key}: ${e.message?.substring(0, 50)}`);
                }
            }
            console.log('  ✅ Done');
        }

        // Import PPPoE sessions
        if (data.pppoeSessions?.length > 0) {
            console.log(`\nImporting ${data.pppoeSessions.length} PPPoE sessions...`);
            for (const item of data.pppoeSessions) {
                try {
                    await db.insert(pppoeSessions).values(item).onConflictDoNothing();
                } catch (e: any) {
                    console.warn(`  Skip PPPoE ${item.name}: ${e.message?.substring(0, 50)}`);
                }
            }
            console.log('  ✅ Done');
        }

        console.log('\n✅ Import complete!');
        process.exit(0);
    } catch (error) {
        console.error('Import failed:', error);
        process.exit(1);
    }
}

importFromJson();
