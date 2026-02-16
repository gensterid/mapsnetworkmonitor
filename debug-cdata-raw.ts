import { oltService } from './apps/api/src/services/olt.service.js';
import { OltDriverFactory } from './apps/api/src/services/olt-drivers/driver.factory.js';
import fs from 'fs';

async function debugCData(oltId: string) {
    console.log(`Starting debug for OLT ID: ${oltId}`);

    // @ts-ignore
    const olt = await oltService.findByIdInternal(oltId);
    if (!olt) {
        console.error('OLT not found');
        return;
    }

    console.log(`Found OLT: ${olt.name} (${olt.host})`);

    const driver = OltDriverFactory.getDriver(
        olt.type || 'cdata',
        olt.host,
        olt.snmpPort, // This might actually be the web port if useWeb is true
        olt.webUsername || 'admin',
        olt.webPassword || '',
        olt.webProtocol || 'http'
    );

    // Override the parseOnuData and internal fetch logic to log raw data
    // We'll use a hacky approach to intercept the fetch if it's using the standard fetch
    // But since it's a private method in the driver, we'll just create a mini-reproduction here

    const protocol = olt.webProtocol || 'http';
    const baseUrl = `${protocol}://${olt.host}:${olt.webPort || 80}`;

    const username = olt.webUsername || 'admin';
    const password = olt.webPassword || ''; // Factory decrypts it, but we need it here

    // We need the decrypted password from the driver instance if possible
    // or just let the driver do its thing and we log the results

    console.log('Fetching ONU list via Driver...');
    try {
        const onus = await driver.getOnuList();
        console.log(`Driver returned ${onus.length} ONUs`);
        fs.writeFileSync('debug-onus-result.json', JSON.stringify(onus, null, 2));

        // Log a few samples of what the driver produced
        console.log('Sample data (first 3):');
        console.log(JSON.stringify(onus.slice(0, 3), null, 2));

    } catch (e: any) {
        console.error('Error fetching ONU list:', e.message);
    }
}

// Pass OLT ID from command line
const targetId = process.argv[2];
if (!targetId) {
    console.error('Please provide OLT ID');
} else {
    debugCData(targetId).catch(console.error);
}
