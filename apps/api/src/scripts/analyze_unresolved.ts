
import 'dotenv/config';
import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { eq, desc, sql, and } from 'drizzle-orm';
import fs from 'fs';

async function analyzeUnresolved() {
    console.log('Analyzing REMAINING Unresolved Alerts...');

    // 1. By Type
    const byType = await db
        .select({
            type: alerts.type,
            count: sql<number>`count(*)`,
        })
        .from(alerts)
        .where(eq(alerts.resolved, false))
        .groupBy(alerts.type)
        .orderBy(desc(sql`count(*)`));

    const output = [];
    output.push('--- Unresolved by Type ---');
    byType.forEach(t => {
        output.push(`${t.type.padEnd(20)}: ${t.count}`);
    });

    // 2. Top 20 Titles of Unresolved
    const topTitles = await db
        .select({
            title: alerts.title,
            count: sql<number>`count(*)`,
            type: alerts.type,
            oldest: sql<string>`MIN(${alerts.createdAt})`,
        })
        .from(alerts)
        .where(eq(alerts.resolved, false))
        .groupBy(alerts.title, alerts.type)
        .orderBy(desc(sql`count(*)`))
        .limit(20);

    output.push('\n--- Top 20 Unresolved Titles ---');
    output.push('Count | Type               | Oldest               | Title');
    output.push('------+--------------------+---------------------+-------------------------');
    topTitles.forEach(t => {
        output.push(`${t.count.toString().padEnd(5)} | ${t.type.padEnd(18)} | ${new Date(t.oldest).toISOString().substring(0, 19)} | ${t.title}`);
    });

    // 3. Date Distribution
    // Count created per day
    const byDate = await db
        .select({
            date: sql<string>`TO_CHAR(${alerts.createdAt}, 'YYYY-MM-DD')`,
            count: sql<number>`count(*)`,
        })
        .from(alerts)
        .where(eq(alerts.resolved, false))
        .groupBy(sql`TO_CHAR(${alerts.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(desc(sql`TO_CHAR(${alerts.createdAt}, 'YYYY-MM-DD')`))
        .limit(10);

    output.push('\n--- Recent Daily Volume (Unresolved) ---');
    byDate.forEach(d => {
        output.push(`${d.date}: ${d.count}`);
    });

    console.log(output.join('\n'));
    // process.exit(0);
}

analyzeUnresolved().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
