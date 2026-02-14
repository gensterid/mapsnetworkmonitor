import { genieacsService } from './src/services/genieacs.service.js';
import { db } from './src/db/index.js';
import * as schema from './src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import { decrypt } from './src/lib/encryption.js';

const DEVICE_ID = '8CDC02-F609-ZTEGCC480C74';
const ROUTER_ID = 'd9328185-2fb1-49cb-a51f-3ec7449d5ad3';

async function run() {
    console.log(`Attempting to debug GenieACS connection for routerId ${ROUTER_ID}...`);

    try {
        const router = await db.query.routers.findFirst({
            where: eq(schema.routers.id, ROUTER_ID)
        });

        if (!router) {
            console.error('Router not found in DB!');
            return;
        }

        console.log('Router found:', router.name);

        // Manual config construction since we can't import private methods
        const url = router.genieacsUrl.replace(/\/$/, '');
        const auth = {
            username: router.genieacsUsername || '',
            password: router.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : ''
        };
        const axiosConfig = { auth, timeout: 5000 };

        console.log('--- Step 1: Listing Devices ---');
        const devices = await genieacsService.getDevices(ROUTER_ID);
        console.log(`Found ${devices.length} devices.`);

        if (devices.length > 0) {

            console.log('--- Step 2: Fetching Target Device (Direct Path) ---');
            try {
                const encodedId = encodeURIComponent(DEVICE_ID);
                await axios.get(`${url}/devices/${encodedId}`, axiosConfig);
                console.log('Direct Path Success!');
            } catch (e: any) {
                console.error(`Direct Path Failed: ${e.response?.status} ${e.response?.statusText}`);
            }

            console.log('--- Step 3: Fetching Target Device (Query Method) ---');
            try {
                const query = { _id: DEVICE_ID };
                const response = await axios.get(`${url}/devices`, {
                    ...axiosConfig,
                    params: {
                        query: JSON.stringify(query)
                    }
                });

                if (response.data && response.data.length > 0) {
                    console.log('Query Method Success! Device found.');
                    console.log('First Key:', Object.keys(response.data[0])[0]);
                } else {
                    console.error('Query Method returned empty list.');
                }
            } catch (e: any) {
                console.error(`Query Method Failed: ${e.message}`);
                if (e.response) console.error(e.response.data);
            }

        } else {
            console.log('No devices found to test.');
        }

    } catch (error) {
        console.error('Script Error:', error);
    } finally {
        process.exit();
    }
}

run();
