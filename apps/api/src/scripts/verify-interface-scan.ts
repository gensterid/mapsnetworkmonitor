import { RouterService } from '../services/router.service';
import { connectToRouter } from '../lib/mikrotik-api';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function main() {
    console.log('Verifying interface scan logic with node-routeros (API check)...');

    // Check if router service works
    try {
        const { RouterService } = await import('../services/router.service');
        const routerService = new RouterService();
        const routers = await routerService.findAll();

        if (routers.length === 0) {
            console.log('No routers found.');
            process.exit(1);
        }

        const router = await routerService.findByIdWithPassword(routers[0].id);
        console.log(`Testing with router: ${router?.name}`);

        if (!router) process.exit(1);

        const api: any = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: router.password
        });
        console.log('Connected to router.');
        console.log('API Keys:', Object.keys(api));
        console.log('API Prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(api)));

        // 1. Get ethernet interfaces
        console.log('Fetching ethernet print via menu()...');
        const ethernetResult = await api.menu('/interface/ethernet').get();

        const ethernetSpeeds: Map<string, string> = new Map();
        const runningEthernetIds: string[] = [];

        ethernetResult.forEach((eth: any) => {
            if (eth.name) {
                if (eth.speed) ethernetSpeeds.set(eth.name, eth.speed);
                const isRunning = eth.running === true || eth.running === 'true';
                if (isRunning && eth['.id']) {
                    runningEthernetIds.push(eth['.id']);
                }
            }
        });

        console.log(`Found ${ethernetResult.length} interfaces, ${runningEthernetIds.length} running.`);

        // 2. Monitor Loop Logic
        if (runningEthernetIds.length > 0) {
            console.log(`[DEBUG] Monitoring ${runningEthernetIds.length} interfaces individually...`);

            await Promise.all(runningEthernetIds.map(async (id: string) => {
                try {
                    console.log(`Monitoring ID: ${id}`);
                    const monitorResult = await Promise.race([
                        api.write([
                            '/interface/ethernet/monitor',
                            `=numbers=${id}`,
                            '=once='
                        ]),
                        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                    ]) as any[];

                    if (monitorResult && monitorResult.length > 0) {
                        const status = monitorResult[0];
                        console.log(`Result for ${id}: Name=${status.name}, Rate=${status.rate}, Status=${status.status}`);
                    }
                } catch (err) {
                    console.log(`[DEBUG] Failed to monitor interface ${id}:`, err instanceof Error ? err.message : err);
                }
            }));
        }

        api.close();
    } catch (e) {
        console.error("Error in verification:", e);
    }
}

main();
