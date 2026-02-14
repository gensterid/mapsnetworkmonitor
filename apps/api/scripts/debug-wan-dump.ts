import axios from 'axios';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from ../.env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function getGenieAcsUrl() {
    console.log('DB URL:', process.env.DATABASE_URL ? 'Set' : 'Not Set');

    if (!process.env.DATABASE_URL) {
        return 'http://127.0.0.1:7557';
    }

    try {
        const sql = postgres(process.env.DATABASE_URL);

        // Dump all settings to check
        const allSettings = await sql`SELECT key, value FROM app_settings`;
        console.log('Available Settings:', allSettings.map(s => `${s.key}=${JSON.stringify(s.value)}`));

        const result = await sql`SELECT value FROM app_settings WHERE key = 'genieacs_url'`;
        await sql.end();

        if (result.length > 0 && result[0].value) {
            console.log('Found GenieACS URL in DB:', result[0].value);
            return result[0].value;
        }
    } catch (e) {
        console.error('Error fetching settings from DB:', e);
    }

    return process.env.GENIEACS_URL || 'http://127.0.0.1:7557';
}

async function main() {
    let GENIEACS_URL = await getGenieAcsUrl();
    // Force 127.0.0.1 if localhost
    if (GENIEACS_URL.includes('localhost')) {
        GENIEACS_URL = GENIEACS_URL.replace('localhost', '127.0.0.1');
    }

    console.log('Connecting to GenieACS at', GENIEACS_URL);

    try {
        // 1. Get all devices to find a ZTE
        const projection = 'InternetGatewayDevice.WANDevice,Device.IP.Interface,_deviceId';
        const url = `${GENIEACS_URL}/devices`;
        console.log(`Fetching devices from ${url}...`);

        const response = await axios.get(url, {
            params: {
                projection: projection
            },
            timeout: 10000
        });

        const devices = response.data;
        console.log(`Found ${devices.length} devices.`);

        // Find a ZTE device
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
            return;
        }

        console.log(`Found Device: ${targetDevice._id} (${targetDevice._deviceId._Manufacturer} ${targetDevice._deviceId._ProductClass})`);
        dumpWan(targetDevice);

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Error fetching devices:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', JSON.stringify(error.response.data, null, 2));
            } else if (error.request) {
                console.error('No response received:', error.request);
            }
        } else {
            console.error('Error:', error);
        }
    }
}

function dumpWan(device: any) {
    const wanDevice = device.InternetGatewayDevice?.WANDevice;
    if (wanDevice) {
        console.log(JSON.stringify(wanDevice, null, 2));
    } else {
        console.log('No InternetGatewayDevice.WANDevice found.');
        if (device.Device?.IP?.Interface) {
            console.log('Found Device.IP.Interface (TR-181):');
            console.log(JSON.stringify(device.Device.IP.Interface, null, 2));
        }
    }
}

main();
