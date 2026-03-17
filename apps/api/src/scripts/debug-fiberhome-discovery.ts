import { genieacsService } from '../services/genieacs.service.js';
import { logger } from '../lib/logger.js';

async function main() {
    const deviceId = process.argv[2]; // e.g. "000AC2-HG6145F-FHTT9C70DAF0"
    const routerId = process.argv[3];

    if (!deviceId) {
        console.log('Usage: npx tsx src/scripts/debug-fiberhome-discovery.ts <deviceId> [routerId]');
        process.exit(1);
    }

    console.log(`\n=== Debugging GenieACS WAN Discovery for: ${deviceId} ===\n`);

    try {
        const device: any = await genieacsService.getDevice(deviceId, routerId);
        if (!device) {
            console.error('Device not found in GenieACS');
            return;
        }

        console.log(`Manufacturer: ${device._deviceId?._Manufacturer}`);
        console.log(`Product Class: ${device._deviceId?._ProductClass}`);
        console.log(`Serial Number: ${device._deviceId?._SerialNumber}`);

        const wanDevices = device.InternetGatewayDevice?.WANDevice;
        if (!wanDevices) {
            console.log('No InternetGatewayDevice.WANDevice found.');
            return;
        }

        // Helper to check if a connection is for Management/Isolation
        const isManagement = (sList: string, n: string) => {
            const combined = (sList + ' ' + n).toUpperCase();
            return combined.includes('TR069') || 
                   combined.includes('MGMT') || 
                   combined.includes('TR-069') ||
                   combined.includes('VLAN100') ||
                   combined.includes('VOIP') ||
                   combined.includes('IPTV');
        };

        for (const wdKey in wanDevices) {
            if (wdKey.startsWith('_')) continue;
            const wanConnDevices = wanDevices[wdKey]?.WANConnectionDevice;
            if (!wanConnDevices) continue;

            console.log(`WANDevice.${wdKey}:`);

            for (const wcdKey in wanConnDevices) {
                if (wcdKey.startsWith('_')) continue;
                const connectionDevice = wanConnDevices[wcdKey];
                const basePath = `InternetGatewayDevice.WANDevice.${wdKey}.WANConnectionDevice.${wcdKey}`;

                console.log(`[${wcdKey}] WANConnectionDevice:`);

                // Check IP
                if (connectionDevice.WANIPConnection) {
                    for (const ipKey in connectionDevice.WANIPConnection) {
                        if (ipKey.startsWith('_')) continue;
                        const ip = connectionDevice.WANIPConnection[ipKey];
                        const name = ip.Name?._value || '';
                        const serviceList = (ip.X_CT_COM_ServiceList?._value || 
                                           ip['X_ZTE-COM_ServiceList']?._value || 
                                           ip['X_HW_ServiceList']?._value || 
                                           ip['X_CT-COM_ServiceList']?._value || '').toUpperCase();
                        
                        const mgmt = isManagement(serviceList, name);
                        console.log(`  - IP.${ipKey}: Name="${name}", Service="${serviceList}" ${mgmt ? '[MGMT - SKIPPED]' : '[INTERNET CANDIDATE]'}`);
                        
                        // Dump ALL parameters for the first interface to see naming conventions
                        if (ipKey === '1') {
                            console.log(`\n    [DEBUG] Dumping all parameters for IP.${ipKey}:`);
                            for (const pKey in ip) {
                                if (pKey.startsWith('_')) continue;
                                if (ip[pKey] && typeof ip[pKey] === 'object' && ip[pKey]._value !== undefined) {
                                    console.log(`      ${pKey}: ${ip[pKey]._value}`);
                                }
                            }
                        }
                    }
                }

                // Check PPP
                if (connectionDevice.WANPPPConnection) {
                    for (const pppKey in connectionDevice.WANPPPConnection) {
                        if (pppKey.startsWith('_')) continue;
                        const ppp = connectionDevice.WANPPPConnection[pppKey];
                        const name = ppp.Name?._value || '';
                        const serviceList = (ppp.X_CT_COM_ServiceList?._value || 
                                           ppp['X_ZTE-COM_ServiceList']?._value || 
                                           ppp['X_HW_ServiceList']?._value || 
                                           ppp['X_CT-COM_ServiceList']?._value || '').toUpperCase();
                        
                        const mgmt = isManagement(serviceList, name);
                        console.log(`  - PPP.${pppKey}: Name="${name}", Service="${serviceList}" ${mgmt ? '[MGMT - SKIPPED]' : '[INTERNET CANDIDATE]'}`);

                         // Dump ALL parameters
                        if (pppKey === '1') {
                            console.log(`\n    [DEBUG] Dumping all parameters for PPP.${pppKey}:`);
                            for (const pKey in ppp) {
                                if (pKey.startsWith('_')) continue;
                                if (ppp[pKey] && typeof ppp[pKey] === 'object' && ppp[pKey]._value !== undefined) {
                                    console.log(`      ${pKey}: ${ppp[pKey]._value}`);
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Debug failed:', error);
    }
}

main();
