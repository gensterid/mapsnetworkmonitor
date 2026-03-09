import { db } from '../db/index.js';
import { users, alerts, tenants, routers, routerGroups, olts, onus, routerNetwatch, notificationGroups } from '../db/schema/index.js';
import { isNull, eq, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

async function main() {
    console.log("🚀 Starting Tenant Visibility Repair Script...");
    
    // 1. Get the Default Tenant
    const allTenants = await db.select().from(tenants).limit(1);
    if (allTenants.length === 0) {
        console.error("❌ No tenants found in database! Please run migrations first.");
        process.exit(1);
    }
    
    const defaultTenantId = allTenants[0].id;
    const defaultTenantName = allTenants[0].name;
    console.log(`🏢 Using Default Tenant: ${defaultTenantName} (${defaultTenantId})`);
    
    // 2. Repair Users
    const usersWithoutTenant = await db.select().from(users).where(isNull(users.tenantId));
    console.log(`👤 Found ${usersWithoutTenant.length} users missing tenantId.`);
    if (usersWithoutTenant.length > 0) {
        await db.update(users)
            .set({ tenantId: defaultTenantId })
            .where(isNull(users.tenantId));
        console.log(`✅ Updated ${usersWithoutTenant.length} users.`);
    }
    
    // 3. Repair Alerts
    const alertsWithoutTenant = await db.select().from(alerts).where(isNull(alerts.tenantId));
    console.log(`🔔 Found ${alertsWithoutTenant.length} alerts missing tenantId.`);
    if (alertsWithoutTenant.length > 0) {
        await db.update(alerts)
            .set({ tenantId: defaultTenantId })
            .where(isNull(alerts.tenantId));
        console.log(`✅ Updated ${alertsWithoutTenant.length} alerts.`);
    }
    
    // 4. Repair Inventory
    const tables = [
        { name: 'routers', schema: routers },
        { name: 'router_groups', schema: routerGroups },
        { name: 'olts', schema: olts },
        { name: 'onus', schema: onus },
        { name: 'router_netwatch', schema: routerNetwatch },
        { name: 'notification_groups', schema: notificationGroups }
    ];
    
    for (const table of tables) {
        // @ts-ignore - Drizzle table update is similar
        const missing = await db.select().from(table.schema).where(isNull(table.schema.tenantId));
        console.log(`📦 Table ${table.name}: ${missing.length} entries missing tenantId.`);
        if (missing.length > 0) {
            // @ts-ignore
            await db.update(table.schema).set({ tenantId: defaultTenantId }).where(isNull(table.schema.tenantId));
            console.log(`   ✅ Repaired.`);
        }
    }
    
    console.log("\n✨ Repair finished! Please restart the API and try logging in as a non-superadmin.");
    process.exit(0);
}

main().catch(err => {
    console.error("❌ Fatal error during repair:", err);
    process.exit(1);
});
