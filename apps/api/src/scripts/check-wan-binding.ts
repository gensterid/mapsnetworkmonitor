import { db } from '../db/index.js';
import { appSettings, routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import 'dotenv/config';
import { decrypt } from '../lib/encryption.js';

const deviceId = '000AC2-HG6145F-FHTT9C70DAF0';

async function checkWanBinding() {
    try {
        const [router] = await db.select().from(routers).where(eq(routers.name, 'genster')).limit(1);
        const url = router?.genieacsUrl;
        const username = router?.genieacsUsername;
        const password = router?.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : '';

        console.log(`Checking WAN Binding for device: ${deviceId}`);

        const response = await axios.get(`${url}/devices`, {
            params: {
                query: JSON.stringify({ _id: deviceId }),
                projection: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice'
            },
            auth: username ? { username, password } : undefined
        });

        if (response.data && response.data.length > 0) {
            const dev = response.data[0];
            const wanDevices = dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice;
            if (wanDevices) {
                Object.keys(wanDevices).forEach(key => {
                    if (key.startsWith('_')) return;
                    const connDevice = wanDevices[key];
                    
                    // Comprehensive search in IP/PPP connections
                    ['WANIPConnection', 'WANPPPConnection'].forEach(type => {
                        const conns = (connDevice as any)[type] || {};
                        Object.keys(conns).forEach(cKey => {
                            if (cKey.startsWith('_')) return;
                            const conn = conns[cKey];
                            console.log(`--- ${type}.${key}.${cKey} ---`);
                            console.log(`Name: ${conn.Name?._value}`);
                            
                            // Find any key that looks like BindPort or LanInterface
                            const bindKeys = Object.keys(conn).filter(k => 
                                k.toLowerCase().includes('bindport') || 
                                k.includes('LanInterface') ||
                                k.includes('ServiceList')
                            );
                            bindKeys.forEach(bk => {
                                console.log(`  ${bk}: ${conn[bk]?._value}`);
                            });

                            // Also check X_CT-COM keys if any
                            const customKeys = Object.keys(conn).filter(k => k.includes('X_CT-COM'));
                            if (customKeys.length > 0) console.log(`  CT-COM Keys: ${customKeys.join(', ')}`);
                        });
                    });
                });
            }
        }
    } catch (e: any) {
        console.error('Check failed:', e.message);
    }
    process.exit(0);
}

checkWanBinding();
