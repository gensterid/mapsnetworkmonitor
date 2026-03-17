import { db } from '../db/index.js';
import { appSettings, routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import 'dotenv/config';
import { decrypt } from '../lib/encryption.js';

const deviceId = '000AC2-HG6145F-FHTT9C70DAF0';

async function debugDevice() {
    try {
        console.log(`Checking device: ${deviceId}`);
        
        const [router] = await db.select().from(routers).where(eq(routers.name, 'genster')).limit(1);

        const url = router?.genieacsUrl;
        const username = router?.genieacsUsername;
        const password = router?.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : '';

        if (!url) {
            console.error('GenieACS URL not found in settings');
            return;
        }

        console.log(`Using GenieACS URL: ${url}`);

        const response = await axios.get(`${url}/devices`, {
            params: {
                query: JSON.stringify({ _id: deviceId }),
                projection: 'InternetGatewayDevice.LANDevice.1.WLANConfiguration'
            },
            auth: username ? { username, password } : undefined
        });

        if (response.data && response.data.length > 0) {
            const dev = response.data[0];
            const wlan = dev.InternetGatewayDevice?.LANDevice?.[1]?.WLANConfiguration;
            if (wlan) {
                console.log('--- WLAN Comparison ---');
                [5, 8].forEach(idx => {
                    const conf = wlan[idx];
                    if (conf) {
                        console.log(`WLAN #${idx} (${conf.SSID?._value}):`);
                        console.log(`  Keys: ${Object.keys(conf).filter(k => !k.startsWith('_')).join(', ')}`);
                        console.log(`  Enable: ${conf.Enable?._value}`);
                        console.log(`  Status: ${conf.Status?._value}`);
                        console.log(`  RadioEnabled exists: ${!!conf.RadioEnabled}`);
                    }
                });
            } else {
                console.log('No WLANConfiguration found');
            }
        } else {
            console.log('Device not found');
        }
    } catch (e: any) {
        console.error('Debug failed:', e.message);
        if (e.response) console.error('Response:', e.response.data);
    }
    process.exit(0);
}

debugDevice();
