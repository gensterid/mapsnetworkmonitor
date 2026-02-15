
import { snmpService } from './src/services/snmp.service.js';
import { db } from './src/db/index.js';
import { olts } from './src/db/schema/olts.js';
import { eq } from 'drizzle-orm';

async function testSnmp() {
    const oltId = '183999af-23fb-4b85-804d-5875054e5665';
    console.log(`--- SNMP Diagnostics for OLT ${oltId} ---`);

    try {
        const [olt] = await db.select().from(olts).where(eq(olts.id, oltId));
        if (!olt) return;

        const config = {
            host: olt.host,
            port: olt.snmpPort || 161,
            community: olt.snmpCommunity || 'public'
        };

        console.log(`Target: ${config.host}:${config.port}, Community: ${config.community}`);

        const oids = [
            '1.3.6.1.2.1.1.1.0', // sysDescr
            '1.3.6.1.2.1.1.3.0', // sysUpTime
            '1.3.6.1.4.1.44582.500.2.1.1.1', // HSGQ sysVersion?
        ];

        for (const oid of oids) {
            console.log(`Querying OID: ${oid}...`);
            try {
                const result = await snmpService.getMultiple(config, [oid]);
                console.log('Result:', JSON.stringify(result, null, 2));
            } catch (e: any) {
                console.log(`Error for ${oid}:`, e.message);
            }
        }

    } catch (error: any) {
        console.error('Diagnostic error:', error.message);
    }
    process.exit(0);
}

testSnmp();
