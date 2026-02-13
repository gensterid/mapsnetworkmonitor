import { snmpService } from './services/snmp.service.js';
import { db } from './db/index.js';
import { routers } from './db/schema/index.js';
import { eq } from 'drizzle-orm';

async function main() {
    const routerId = process.argv[2];
    if (!routerId) {
        console.log('Usage: npx tsx src/test-snmp.ts <routerId>');
        process.exit(1);
    }

    const router = await db.query.routers.findFirst({
        where: eq(routers.id, routerId)
    });

    if (!router) {
        console.error('Router not found');
        process.exit(1);
    }

    const config = {
        host: router.host,
        community: router.snmpCommunity || 'public',
        port: router.snmpPort || 161
    };

    console.log(`Testing SNMP for ${router.name} (${router.host})...`);
    console.log(`Config: community=${config.community}, port=${config.port}`);

    try {
        console.log('Walking ifName (1.3.6.1.2.1.31.1.1.1.1)...');
        const ifNames = await snmpService.walk(config, '1.3.6.1.2.1.31.1.1.1.1');
        console.log(`Found ${ifNames.length} ifNames`);

        console.log('Walking ifDescr (1.3.6.1.2.1.2.2.1.2)...');
        const ifDescrs = await snmpService.walk(config, '1.3.6.1.2.1.2.2.1.2');

        console.log('Walking ifHCInOctets (64-bit: 1.3.6.1.2.1.31.1.1.1.6)...');
        const inOctets64 = await snmpService.walk(config, '1.3.6.1.2.1.31.1.1.1.6').catch(e => { console.log('64-bit In failed'); return []; });

        console.log('Walking ifHCOutOctets (64-bit: 1.3.6.1.2.1.31.1.1.1.10)...');
        const outOctets64 = await snmpService.walk(config, '1.3.6.1.2.1.31.1.1.1.10').catch(e => { console.log('64-bit Out failed'); return []; });

        console.log('Walking ifInOctets (32-bit: 1.3.6.1.2.1.2.2.1.10)...');
        const inOctets32 = await snmpService.walk(config, '1.3.6.1.2.1.2.2.1.10');

        console.log('Walking ifOutOctets (32-bit: 1.3.6.1.2.1.2.2.1.16)...');
        const outOctets32 = await snmpService.walk(config, '1.3.6.1.2.1.2.2.1.16');

        console.log(`\nFound ${ifNames.length} interfaces via ifName`);

        const data = ifNames.map(r => {
            const idx = r.oid.split('.').pop();
            const descr = ifDescrs.find(d => d.oid.split('.').pop() === idx)?.value.toString();
            const in64 = inOctets64.find(o => o.oid.split('.').pop() === idx)?.value;
            const out64 = outOctets64.find(o => o.oid.split('.').pop() === idx)?.value;
            const in32 = inOctets32.find(o => o.oid.split('.').pop() === idx)?.value;
            const out32 = outOctets32.find(o => o.oid.split('.').pop() === idx)?.value;

            return {
                idx,
                name: r.value.toString(),
                descr,
                in64: in64 ? in64.toString() : 'N/A',
                out64: out64 ? out64.toString() : 'N/A',
                in32: in32 ? in32.toString() : 'N/A',
                out32: out32 ? out32.toString() : 'N/A'
            };
        });

        console.table(data);

    } catch (err) {
        console.error('SNMP test failed with error:');
        console.error(err);
    }
}

main();
