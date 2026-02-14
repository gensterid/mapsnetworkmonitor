import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import { decrypt } from '../src/lib/encryption.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') }); // pointing to apps/api/.env

async function run() {
    console.log('--- Debug WAN Dump V2 ---');

    try {
        // 1. Get first valid router
        const routers = await db.query.routers.findMany();
        const router = routers.find(r => r.genieacsUrl && r.genieacsUsername);

        if (!router || !router.genieacsUrl) {
            console.error('No router with GenieACS configuration found in DB!');
            return;
        }

        console.log('Using Router:', router.name, 'URL:', router.genieacsUrl);

        const url = router.genieacsUrl.replace(/\/$/, '');
        const auth = {
            username: router.genieacsUsername || '',
            password: router.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : ''
        };

        // 2. Fetch Devices
        const projection = 'InternetGatewayDevice.WANDevice,Device.IP.Interface,_deviceId';
        console.log(`Fetching devices from ${url}...`);

        const response = await axios.get(`${url}/devices`, {
            params: { projection },
            auth,
            timeout: 10000
        });

        const devices = response.data;
        console.log(`Found ${devices.length} devices.`);

        // 3. Find ZTE
        const targetDevice = devices.find((d: any) =>
            d._deviceId?._Manufacturer?.toLowerCase().includes('zte') ||
            d._deviceId?._ProductClass?.toLowerCase().includes('f609')
        );

        if (!targetDevice) {
            console.log('No ZTE F609 device found in the list.');
            if (devices.length > 0) {
                console.log('Dumping first available device:', devices[0]._id);
                dumpWan(devices[0]);
            }
        } else {
            console.log(`Found Device: ${targetDevice._id} (${targetDevice._deviceId._Manufacturer} ${targetDevice._deviceId._ProductClass})`);
            dumpWan(targetDevice);
        }

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('GenieACS Error:', error.message);
            if (error.response) console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Script Error:', error);
        }
    } finally {
        process.exit();
    }
}

function dumpWan(device: any) {
    const wanDevice = device.InternetGatewayDevice?.WANDevice;
    if (wanDevice) {
        console.log('--- WANDevice Dump ---');
        console.log(JSON.stringify(wanDevice, null, 2));
    } else {
        console.log('No InternetGatewayDevice.WANDevice found.');
        if (device.Device?.IP?.Interface) {
            console.log('Found Device.IP.Interface (TR-181).');
        }
    }
}

run();
