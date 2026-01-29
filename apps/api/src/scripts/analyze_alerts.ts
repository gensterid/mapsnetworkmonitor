
import 'dotenv/config';
import { db } from '../db/index.js';
import { alerts, routers } from '../db/schema/index.js';
import { eq, desc, sql, and } from 'drizzle-orm';
import fs from 'fs';

async function analyzeAlerts() {
    console.log('Analyzing alert database...');

    // 1. Total counts
    const counts = await db
        .select({
            total: sql<number>`count(*)`,
            unresolved: sql<number>`SUM(CASE WHEN ${alerts.resolved} = false THEN 1 ELSE 0 END)`,
        })
        .from(alerts);

    const output = [];
    output.push('--- General Stats ---');
    output.push(`Total Alerts: ${counts[0].total}`);
    output.push(`Unresolved:   ${counts[0].unresolved}`);

    // 2. By Type
    const byType = await db
        .select({
            type: alerts.type,
            count: sql<number>`count(*)`,
            unresolved: sql<number>`SUM(CASE WHEN ${alerts.resolved} = false THEN 1 ELSE 0 END)`,
        })
        .from(alerts)
        .groupBy(alerts.type)
        .orderBy(desc(sql`count(*)`));

    output.push('\n--- By Type ---');
    byType.forEach(t => {
        output.push(`${t.type.padEnd(20)}: ${t.count} (Unresolved: ${t.unresolved})`);
    });

    // 3. Top 10 Common Titles (to see if it's specific devices)
    const topTitles = await db
        .select({
            title: alerts.title,
            count: sql<number>`count(*)`,
        })
        .from(alerts)
        .groupBy(alerts.title)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

    output.push('\n--- Top 10 Alert Titles ---');
    topTitles.forEach(t => {
        output.push(`${t.count.toString().padEnd(6)} : ${t.title}`);
    });

    // 4. Oldest and Newest
    const dates = await db
        .select({
            oldest: sql<string>`MIN(${alerts.createdAt})`,
            newest: sql<string>`MAX(${alerts.createdAt})`,
        })
        .from(alerts);

    output.push('\n--- Date Range ---');
    output.push(`Oldest Alert: ${dates[0].oldest}`);
    output.push(`Newest Alert: ${dates[0].newest}`);

    fs.writeFileSync('analysis_result.txt', output.join('\n'));
    console.log('Analysis written to analysis_result.txt');
    process.exit(0);
}

analyzeAlerts();
