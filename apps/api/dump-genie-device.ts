import { genieacsService } from './src/services/genieacs.service.js';

const DEVICE_ID = '000AC2-HG6243C-FHTT96F34FD0'; // FiberHome HG6243C
const ROUTER_ID = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3';

async function dump() {
    console.log(`Dumping raw data for device ${DEVICE_ID}...`);
    try {
        const device = await genieacsService.getDevice(DEVICE_ID, ROUTER_ID);
        if (device) {
            console.log(JSON.stringify(device, null, 2));
        } else {
            console.log('Device not found.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

dump();
