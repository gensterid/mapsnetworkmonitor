
import 'dotenv/config';
import { routerService } from '../src/services';
import { db } from '../src/db';

async function main() {
    console.log('Fetching routers...');
    const routers = await routerService.findAll();
    console.log(`Found ${routers.length} routers.`);

    for (const router of routers) {
        console.log(`\nTesting connection to ${router.name} (${router.host}:${router.port})...`);
        try {
            const result = await routerService.testConnection(router.id);
            if (result.success) {
                console.log('✅ Connection successful!');
                console.log('Info:', result.info);
            } else {
                console.error('❌ Connection failed:', result.error);
            }
        } catch (error) {
            console.error('❌ Unexpected error:', error);
        }
    }

    process.exit(0);
}

main().catch(console.error);
