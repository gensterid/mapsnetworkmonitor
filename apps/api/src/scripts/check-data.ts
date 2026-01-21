import 'dotenv/config';
import { db } from '../db/index.js';
import { routers, users, alerts, routerNetwatch } from '../db/schema/index.js';
import { sql } from 'drizzle-orm';

async function checkData() {
    try {
        console.log('=== Checking Database Data ===\n');
        console.log('Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));

        // Check routers
        const routerList = await db.select().from(routers);
        console.log(`\n📡 Routers: ${routerList.length}`);
        routerList.forEach(r => console.log(`   - ${r.name} (${r.host})`));

        // Check users
        const userList = await db.select().from(users);
        console.log(`\n👤 Users: ${userList.length}`);
        userList.forEach(u => console.log(`   - ${u.name} (${u.email}) - ${u.role}`));

        // Check alerts
        const alertList = await db.select().from(alerts);
        console.log(`\n🔔 Alerts: ${alertList.length}`);

        // Check netwatch
        const netwatchList = await db.select().from(routerNetwatch);
        console.log(`\n🌐 Netwatch entries: ${netwatchList.length}`);

        // List all tables
        const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
        console.log('\n📋 Available tables:');
        tables.forEach((t: any) => console.log(`   - ${t.table_name}`));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkData();
