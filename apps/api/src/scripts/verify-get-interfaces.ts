import { RouterService } from '../services/router.service';
import { connectToRouter, getRouterInterfaces } from '../lib/mikrotik-api';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function main() {
    console.log('Verifying getRouterInterfaces...');

    // Dynamically import db/service if needed (but we use direct lib call)
    // We just need a router credential
    const { RouterService } = await import('../services/router.service');
    const { db } = await import('../db'); // needed for RouterService

    const routerService = new RouterService();
    const routers = await routerService.findAll();

    if (routers.length === 0) {
        console.log('No routers found.');
        process.exit(1);
    }

    const router = await routerService.findByIdWithPassword(routers[0].id);
    console.log(`Testing with router: ${router?.name}`);

    if (!router) process.exit(1);

    try {
        const api = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: router.password
        });

        const interfaces = await getRouterInterfaces(api);
        console.log(`Got ${interfaces.length} interfaces.`);

        // Find ether2 (running) and check speed
        const running = interfaces.find(i => i.running && (i.name === 'ether2' || i.name.includes('ether')));
        if (running) {
            console.log(`Interface ${running.name}: Speed="${running.speed}" Type="${running.type}"`);
        } else {
            console.log('No running ethernet interface found to check.');
        }

        api.close();

    } catch (err) {
        console.error('Test failed:', err);
    }
    process.exit(0);
}

main();
