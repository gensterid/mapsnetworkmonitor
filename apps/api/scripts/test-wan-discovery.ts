import { db } from '../src/db/index.js';
import axios from 'axios';
import { decrypt } from '../src/lib/encryption.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { routers } from '../src/db/schema/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Copy of the logic from genieacs.service.ts
function findWanPath(device: any, wanType: 'pppoe' | 'ip'): string | null {
    try {
        console.log(`[WAN-Discovery] Starting discovery for ${wanType}...`);

        const wanDevices = device.InternetGatewayDevice?.WANDevice;
        if (!wanDevices) {
            console.log('[WAN-Discovery] No InternetGatewayDevice.WANDevice found');
            return null;
        }

        for (const wdKey in wanDevices) {
            if (wdKey.startsWith('_')) continue;

            const wanConnDevices = wanDevices[wdKey]?.WANConnectionDevice;
            if (!wanConnDevices) continue;

            console.log(`[WAN-Discovery] Checking WANDevice.${wdKey}...`);

            for (const wcdKey in wanConnDevices) {
                if (wcdKey.startsWith('_')) continue;

                const connectionDevice = wanConnDevices[wcdKey];
                const basePath = `InternetGatewayDevice.WANDevice.${wdKey}.WANConnectionDevice.${wcdKey}`;

                console.log(`[WAN-Discovery] Checking WANConnectionDevice.${wcdKey}...`);

                if (wanType === 'pppoe' && connectionDevice.WANPPPConnection) {
                    for (const pppKey in connectionDevice.WANPPPConnection) {
                        if (pppKey.startsWith('_')) continue;
                        const pppConn = connectionDevice.WANPPPConnection[pppKey];

                        const name = pppConn.Name?._value || '';
                        const serviceList = pppConn.X_CT_COM_ServiceList?._value || pppConn['X_ZTE-COM_ServiceList']?._value || '';
                        const connectionType = pppConn.ConnectionType?._value || '';

                        console.log(`[WAN-Discovery] Candidate: ${basePath}.WANPPPConnection.${pppKey}`, { name, serviceList, connectionType });

                        if (serviceList.toUpperCase().includes('INTERNET') || name.toUpperCase().includes('INTERNET')) {
                            console.log('MATCH: ServiceList or Name includes INTERNET');
                            return `${basePath}.WANPPPConnection.${pppKey}`;
                        }

                        if (connectionType === 'IP_Routed') {
                            console.log('MATCH: ConnectionType is IP_Routed');
                            return `${basePath}.WANPPPConnection.${pppKey}`;
                        }
                    }
                }
            }
        }
        return null;
    } catch (e) {
        console.error('[WAN-Discovery] Error:', e);
        return null;
    }
}

async function run() {
    try {
        const router = await db.query.routers.findFirst({
            where: (routers, { isNotNull }) => isNotNull(routers.genieacsUrl)
        });

        if (!router || !router.genieacsUrl) {
            console.error('No router found');
            return;
        }

        const url = router.genieacsUrl.replace(/\/$/, '');
        const auth = {
            username: router.genieacsUsername || '',
            password: router.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : ''
        };

        const response = await axios.get(`${url}/devices`, {
            params: { projection: 'InternetGatewayDevice.WANDevice,Device.IP.Interface,_deviceId' },
            auth,
            timeout: 10000
        });

        const devices = response.data;
        const targetDevice = devices.find((d: any) =>
            d._deviceId?._Manufacturer?.toLowerCase().includes('zte') ||
            d._deviceId?._ProductClass?.toLowerCase().includes('f609')
        );

        if (targetDevice) {
            console.log(`Testing with device: ${targetDevice._id}`);
            const path = findWanPath(targetDevice, 'pppoe');
            console.log('--- RESULT ---');
            console.log('Detected Path:', path);
        } else {
            console.log('No ZTE device found to test.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

run();
