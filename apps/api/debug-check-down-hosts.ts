import 'dotenv/config';
import { db } from './src/db';
import { routers, routerNetwatch } from './src/db/schema';
import { eq, and } from 'drizzle-orm';
import { connectToRouter } from './src/lib/mikrotik-api';
import { decrypt } from './src/lib/encryption';

async function checkDownHosts() {
    console.log('Searching for "down" hosts in database...');

    // Get all 'down' entries
    const downEntries = await db.select({
        id: routerNetwatch.id,
        host: routerNetwatch.host,
        name: routerNetwatch.name,
        status: routerNetwatch.status,
        lastCheck: routerNetwatch.lastCheck,
        routerId: routerNetwatch.routerId,
        routerName: routers.name,
        routerHost: routers.host,
        routerPort: routers.port,
        routerUsername: routers.username,
        routerPassword: routers.passwordEncrypted,
    })
        .from(routerNetwatch)
        .innerJoin(routers, eq(routerNetwatch.routerId, routers.id))
        .where(eq(routerNetwatch.status, 'down'));

    if (downEntries.length === 0) {
        console.log('No hosts are currently marked as "down" in the database.');
        return;
    }

    console.log(`Found ${downEntries.length} down hosts. verifying with MikroTik...`);

    for (const entry of downEntries) {
        console.log(`\n--- Checking ${entry.host} (${entry.name}) on router ${entry.routerName} ---`);
        console.log(`DB Status: ${entry.status}, Last Check: ${entry.lastCheck}`);

        try {
            const password = decrypt(entry.routerPassword);
            const api = await connectToRouter({
                host: entry.routerHost,
                port: entry.routerPort,
                username: entry.routerUsername,
                password: password,
            });

            const [mokrotikEntry] = await api.write('/tool/netwatch/print', [`?host=${entry.host}`]);

            if (!mokrotikEntry) {
                console.log('❌ Entry NOT FOUND in MikroTik!');
            } else {
                console.log(`MikroTik Status: ${mokrotikEntry.status}`);
                console.log(`MikroTik Since: ${mokrotikEntry.since}`);
                console.log(`MikroTik Interval: ${mokrotikEntry.interval}`);
                console.log(`MikroTik Timeout: ${mokrotikEntry.timeout}`);

                if (mokrotikEntry.status !== entry.status) {
                    console.log('🚨 MISMATCH DETECTED! Database is out of sync.');
                } else {
                    console.log('✅ Status matches (Device is really down in MikroTik).');
                    console.log('Possible reasons: Firewall, wrong IP, unreachable from Router, or default timeout too low.');
                }
            }

            api.close();
        } catch (error: any) {
            console.error(`Failed to connect/check router: ${error.message}`);
        }
    }
}

checkDownHosts();
