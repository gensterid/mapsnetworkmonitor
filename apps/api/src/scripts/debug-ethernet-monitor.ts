import { RouterService } from '../services/router.service';
import { connectToRouter } from '../lib/mikrotik-api';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function main() {
    console.log('Debugging Ethernet Monitor...');

    // Dynamically import db/service
    const { RouterService } = await import('../services/router.service');

    const routerService = new RouterService();
    const routers = await routerService.findAll();

    if (routers.length === 0) {
        console.log('No routers found in DB.');
        process.exit(1);
    }

    const router = await routerService.findByIdWithPassword(routers[0].id);
    console.log(`Testing with router: ${router?.name} (${router?.host})`);

    if (!router) process.exit(1);

    try {
        const api = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: router.password
        });
        console.log('Connected to router.');

        // Get ethernet interfaces
        const ethInterfaces = await api.write('/interface/ethernet/print');
        console.log(`Found ${ethInterfaces.length} ethernet interfaces.`);

        const runningEth = ethInterfaces.filter((i: any) => i.running === 'true'); // Keep full objects
        console.log('Running Ethernet interfaces:', runningEth.map((i: any) => i.name).join(', ')); // Log names

        if (runningEth.length > 0) {
            // First running
            const first = runningEth[0]; // Object
            const name = first.name;
            const id = first['.id'];
            console.log(`\nMonitoring "${name}" (ID: ${id})...`);

            // Inspect API
            console.log('API methods:', Object.keys(api));
            try {
                // Try to access prototype safely?
                // console.log('API prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(api)));
            } catch (e) { }

            // Try RAW like approach if write takes array?
            // Or just retry write with different 'once' param
            try {
                // Assuming write takes (path, params)
                console.log("Attempting monitor by ID with once...");
                const result = await Promise.race([
                    api.write('/interface/ethernet/monitor', {
                        'numbers': id,
                        'once': ''
                    }),
                    new Promise((_, r) => setTimeout(() => r(new Error('Timeout - monitor hung')), 3000))
                ]);
                console.log('Monitor Result Count:', result.length);
                if (result.length > 0) {
                    console.log('Monitor Result Keys:', Object.keys(result[0]));
                    console.log('Monitor Rate:', result[0].rate);
                    console.log('Monitor Status:', result[0].status);
                }
            } catch (e: any) {
                console.log('Monitor failed:', e.message);
            }

            // Try 'numbers' as index ?? 
            // Usually 'monitor' takes numbers (IDs) or names. 
            // API might expect names in 'numbers' param if dealing with names.
        }

        // Try fetching detail
        console.log('Fetching ethernet detail...');
        const detailResult = await api.write('/interface/ethernet/print', { 'detail': '' });

        // Find a running one
        const runningDetail = detailResult.find((i: any) => i.running === 'true');

        if (runningDetail) {
            console.log('Running Interface Detail:', JSON.stringify(runningDetail, null, 2));
        } else {
            console.log('No running interface found in detail result.');
            if (detailResult.length > 0) console.log('First Item Detail:', JSON.stringify(detailResult[0], null, 2));
        }

        // Check for 'rate' or 'speed' in the result
        const hasRate = detailResult.some((i: any) => i.rate || i['rate']);
        console.log('Has rate field in print?', hasRate);

        const hasSpeed = detailResult.some((i: any) => i.speed || i['speed']);
        console.log('Has speed field in print?', hasSpeed);

        api.close();

    } catch (err) {
        console.error('Test failed:', err);
    }
    process.exit(0);
}

main();
