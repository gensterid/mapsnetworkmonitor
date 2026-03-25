import snmp from 'net-snmp';
import { db } from '../db/index.js';
import { routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

async function debugGensterCounters() {
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

    const session = snmp.createSession(config.host, config.community, {
        port: config.port,
        version: config.version,
        timeout: 5000,
        retries: 2
    });

    // We know ether1-Inet is index 1 from previous logs
    const index = 1;
    const oids = [
        `1.3.6.1.2.1.2.2.1.10.${index}`,   // ifInOctets (32-bit)
        `1.3.6.1.2.1.2.2.1.16.${index}`,   // ifOutOctets (32-bit)
        `1.3.6.1.2.1.31.1.1.1.6.${index}`,  // ifHCInOctets (64-bit)
        `1.3.6.1.2.1.31.1.1.1.10.${index}` // ifHCOutOctets (64-bit)
    ];

    console.log(`📊 Fetching counters for index ${index} (ether1-Inet)...`);

    session.get(oids, (error, varbinds) => {
        if (error) {
            console.error('❌ SNMP Get Error:', error.message);
        } else if (!varbinds) {
            console.error('❌ SNMP Error: No varbinds returned.');
        } else {
            for (let i = 0; i < varbinds.length; i++) {
                const vb = varbinds[i];
                if (snmp.isVarbindError(vb)) {
                    console.error(`❌ OID ${vb.oid} Error: ${snmp.varbindError(vb)}`);
                } else {
                    let val = vb.value;
                    let type = typeof val;
                    if (Buffer.isBuffer(val)) {
                        try {
                            const bigIntVal = val.readBigUInt64BE();
                            val = `${bigIntVal} (64-bit Buffer)`;
                        } catch (e) {
                            val = `Buffer(${val.length} bytes)`;
                        }
                    }
                    console.log(`✅ ${vb.oid}: [${type}] ${val}`);
                }
            }
        }
        session.close();
        process.exit(error ? 1 : 0);
    });
}

debugGensterCounters().catch(err => {
    console.error('💥 Fatal Error:', err);
    process.exit(1);
});
