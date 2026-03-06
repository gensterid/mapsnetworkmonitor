import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function checkHost() {
    try {
        const routerId = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3';
        const host = '10.100.100.13';

        // Check if host exists in netwatch
        const netwatchRes = await db.execute(sql`SELECT * FROM router_netwatch WHERE router_id = ${routerId} AND host = ${host}`);
        console.log(`Netwatch entries for host ${host}:`, netwatchRes.length);
        if (netwatchRes.length > 0) {
            console.log('Status:', netwatchRes[0].status);
            console.log('Disabled:', netwatchRes[0].disabled);
            console.log('Tenant ID:', netwatchRes[0].tenant_id);
            console.log('Last Check:', netwatchRes[0].last_check);
        } else {
            console.log('Host not found in router_netwatch.');
        }

        // Check performance history 
        const perfRes = await db.execute(sql`SELECT * FROM device_performance_history WHERE router_id = ${routerId} AND host = ${host} ORDER BY recorded_at DESC LIMIT 5`);
        console.log(`Performance points for host ${host}:`, perfRes.length);
        if (perfRes.length > 0) {
            console.log('Sample data:');
            console.log(JSON.stringify(perfRes, null, 2));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkHost();
