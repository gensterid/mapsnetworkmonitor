import snmp from 'net-snmp';
import { db } from '../db/index.js';
import { routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

async function debugGenster() {
    console.log('🔍 Fetching current router config from DB...');
    const [router] = await db.select().from(routers).where(eq(routers.name, 'genster'));

    if (!router) {
        console.error('❌ Router "genster" not found in DB!');
        return;
    }

    const config = {
        host: router.snmpHost || router.host,
        port: router.snmpPort || 161,
        community: router.snmpCommunity || 'public',
        version: snmp.Version2c
    };

    console.log('📡 SNMP Config used by App:', JSON.stringify(config, null, 2));

    const session = snmp.createSession(config.host, config.community, {
        port: config.port,
        version: config.version,
        timeout: 5000,
        retries: 2
    });

    const oid = '1.3.6.1.2.1.31.1.1.1.1';
    console.log(`🚶 Starting subtree walk on ${oid}...`);

    let count = 0;
    session.subtree(oid, (varbinds) => {
        for (const vb of varbinds) {
            count++;
            if (count % 10 === 0) console.log(`   Fetched ${count} items...`);
        }
    }, (error) => {
        if (error) {
            console.error('❌ SNMP Walk Error:', error.message);
        } else {
            console.log(`✅ Walk complete! Found ${count} items.`);
        }
        session.close();
        process.exit(error ? 1 : 0);
    });
}

debugGenster().catch(err => {
    console.error('💥 Fatal Error:', err);
    process.exit(1);
});
