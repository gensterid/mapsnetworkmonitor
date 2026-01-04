import { RouterService } from '../services/router.service';
import { connectToRouter } from '../lib/mikrotik-api';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function main() {
    console.log('Debugging monitor-traffic API call...');

    // Dynamically import db/service
    const { RouterService } = await import('../services/router.service');
    const { db } = await import('../db');

    // 1. Get a router
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

        // 2. Get running interfaces
        const interfaces = await api.write('/interface/print');
        const running = interfaces.filter((i: any) => i.running === 'true' && i.disabled === 'false');
        console.log(`Found ${running.length} running interfaces.`);

        if (running.length === 0) {
            console.log('No running interfaces to monitor.');
            api.close();
            process.exit(0);
        }

        const names = running.map((i: any) => i.name);
        console.log('Interface names:', names.join(', '));

        // 3. Monitor 'ether2' (or first one)
        const first = names[0];
        console.log(`\nTesting monitor-traffic for single interface: "${first}"`);

        // Variation 1: as flag (empty string)
        try {
            console.log("Variation 1: once: ''");
            const res1 = await Promise.race([
                api.write('/interface/monitor-traffic', {
                    'interface': first,
                    'once': ''
                }),
                new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 3000))
            ]);
            console.log('Result 1:', JSON.stringify(res1));
        } catch (e: any) {
            console.log('Error 1:', e.message);
        }

        // Variation 2: once: 'yes'
        try {
            console.log("Variation 2: once: 'yes'");
            const res2 = await Promise.race([
                api.write('/interface/monitor-traffic', {
                    'interface': first,
                    'once': 'yes'
                }),
                new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 3000))
            ]);
            console.log('Result 2:', JSON.stringify(res2));
        } catch (e: any) {
            console.log('Error 2:', e.message);
        }

        // Variation 3: try getting specific prop
        try {
            console.log("Variation 3: get specific props");
            const res3 = await Promise.race([
                api.write('/interface/monitor-traffic', {
                    'interface': first,
                    'once': '',
                    'proplist': 'rx-bits-per-second,tx-bits-per-second'
                }),
                new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 3000))
            ]);
            console.log('Result 3:', JSON.stringify(res3));
        } catch (e: any) {
            console.log('Error 3:', e.message);
        }

        api.close();

    } catch (err) {
        console.error('Test failed:', err);
    }
    process.exit(0);
}

main();
