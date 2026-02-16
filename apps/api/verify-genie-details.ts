import { genieacsService } from './src/services/genieacs.service.js';
import { db } from './src/db/index.js';
import * as schema from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const ROUTER_ID = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3';

async function verify() {
    console.log(`Verifying detailed GenieACS data for routerId ${ROUTER_ID}...`);

    try {
        const devices = await genieacsService.getDevices(ROUTER_ID);
        console.log(`\nFound ${devices.length} devices total.`);

        const sampleSize = 5;
        const samples = devices.slice(0, sampleSize);

        console.log(`\nListing first ${sampleSize} devices with details:`);
        console.log('--------------------------------------------------');

        samples.forEach(dev => {
            console.log(`ID: ${dev._id}`);
            console.log(`Serial: ${dev._serialNumber || 'N/A'}`);
            console.log(`IP: ${dev._ip || 'N/A'}`);
            console.log(`SSID: ${dev._ssid || 'N/A'}`);
            console.log(`Rx Power: ${dev._rxPower || 'N/A'}`);
            console.log(`Manufacturer: ${dev._manufacturer || 'N/A'}`);
            console.log(`Model: ${dev._productClass || 'N/A'}`);
            console.log(`TR-181: ${dev._isTr181 ? 'Yes' : 'No'}`);
            console.log('--------------------------------------------------');
        });

        // Count how many have IP, SSID, RxPower
        const withIp = devices.filter(d => d._ip).length;
        const withSsid = devices.filter(d => d._ssid).length;
        const withRx = devices.filter(d => d._rxPower).length;

        console.log(`\nSummary Statistics:`);
        console.log(`Devices with IP: ${withIp}/${devices.length}`);
        console.log(`Devices with SSID: ${withSsid}/${devices.length}`);
        console.log(`Devices with Rx Power: ${withRx}/${devices.length}`);

    } catch (error) {
        console.error('Verification Script Error:', error);
    } finally {
        process.exit();
    }
}

verify();
