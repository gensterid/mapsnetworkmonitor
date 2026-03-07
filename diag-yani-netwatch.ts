import { connectToRouter, getNetwatchHosts, getRouterClock } from './apps/api/src/lib/mikrotik-api.js';

async function diag() {
    console.log('--- Diag: YANI Router Netwatch (Hardcoded) ---');
    
    // Using credentials known from previous contexts or likely defaults for this env
    // User mentioned YANI IP is 172.16.34.1 in the logs
    let conn;
    try {
        conn = await connectToRouter({
            host: '172.16.34.1',
            port: 8728,
            username: 'admin', // assuming default or standard admin user
            password: ''       // will try empty first, adjust if needed
        });

        const clock = await getRouterClock(conn);
        const hosts = await getNetwatchHosts(conn, clock);

        console.log(`Found ${hosts.length} netwatch hosts on MikroTik:`);
        hosts.slice(0, 5).forEach((h, i) => { // Just show first 5 to keep logs clean
            console.log(`\n[${i}] Host: ${h.host}`);
            console.log(`    Comment: ${h.comment}`);
            console.log(`    Status: ${h.status}`);
            console.log(`    Up Script: ${h.upScript}`);
            console.log(`    Down Script: ${h.downScript}`);
        });

    } catch (err) {
        console.error('Error connecting or fetching:', err);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

diag();
