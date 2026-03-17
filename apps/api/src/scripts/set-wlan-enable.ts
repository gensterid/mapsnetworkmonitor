import { db } from '../db/index.js';
import { appSettings, routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import 'dotenv/config';
import { decrypt } from '../lib/encryption.js';

const deviceId = '000AC2-HG6145F-FHTT9C70DAF0';
const wlanIndex = 5;
const enableValue = false; // Try to disable

async function testSetWlan() {
    try {
        const [router] = await db.select().from(routers).where(eq(routers.name, 'genster')).limit(1);
        if (!router) throw new Error('Router not found');

        const url = router?.genieacsUrl;
        const username = router?.genieacsUsername;
        const password = router?.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : '';

        if (!url) throw new Error('GenieACS URL not found');

        console.log(`--- Testing WLAN #${wlanIndex} Disable ---`);
        console.log(`URL: ${url}`);
        console.log(`Device: ${deviceId}`);

        const path = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}.Enable`;
        
        // Simple payload: ONLY Enable
        const body = [
            ["setParameterValues", {
                [path]: [enableValue, "xsd:boolean"]
            }]
        ];

        console.log('Sending request...');
        const response = await axios.post(`${url}/devices/${deviceId}/tasks`, body, {
            auth: username ? { username, password } : undefined,
            timeout: 60000 // 60 seconds
        });

        console.log('Task Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));

        // Let's also trigger a refresh immediately to see if it took effect
        console.log('Triggering refresh...');
        await axios.post(`${url}/devices/${deviceId}/tasks`, [["refreshObject", { path: "InternetGatewayDevice.LANDevice.1.WLANConfiguration" }]], {
            auth: username ? { username, password } : undefined
        });

    } catch (e: any) {
        console.error('Test failed:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', JSON.stringify(e.response.data, null, 2));
        }
    }
    process.exit(0);
}

testSetWlan();
