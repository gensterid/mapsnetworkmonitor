import { routerNetwatchService } from './apps/api/src/services/router-netwatch.service.js';
import { db } from './apps/api/src/db/index.js';
import { routerNetwatch } from './apps/api/src/db/schema/index.js';
import { eq } from 'drizzle-orm';

async function testJoin() {
    console.log('--- Testing New Join Logic ---');
    try {
        const targetHost = '10.100.100.12';

        // 1. Get Router ID
        const nwEntries = await db.select().from(routerNetwatch).where(eq(routerNetwatch.host, targetHost));
        if (nwEntries.length === 0) {
            console.log('Target host not found in routerNetwatch.');
            return;
        }
        const routerId = nwEntries[0].routerId;
        console.log(`Analyzing Router ID: ${routerId} for host ${targetHost}`);

        // 2. Call getNetwatchAll
        console.log('Calling getNetwatchAll...');
        const results = await routerNetwatchService.getNetwatchAll([routerId]);

        // 3. Filter for our target
        const targetResult = results.find((r: any) => r.host === targetHost);

        if (targetResult) {
            console.log('\n--- Merged Tooltip Data ---');
            console.log(`Name:        ${targetResult.name}`);
            console.log(`Host:        ${targetResult.host}`);
            console.log(`Status:      ${targetResult.status}`);
            console.log(`RxPower:     ${targetResult.lastRxPower || 'MISSING'}`);
            console.log(`Model:       ${targetResult.model || 'MISSING'}`);
            console.log(`SSID:        ${targetResult.ssid || 'MISSING'}`);
            console.log(`Firmware:    ${targetResult.firmwareVersion || 'MISSING'}`);
            console.log(`OLT Name:    ${targetResult.oltName || 'MISSING'}`);
            console.log(`ONU ID:      ${targetResult.onuId || 'MISSING'}`);
        } else {
            console.log('Target host not found in getNetwatchAll results.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

testJoin();
