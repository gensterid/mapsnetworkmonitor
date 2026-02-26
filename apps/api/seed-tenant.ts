import { settingsService } from './src/services/settings.service.js';

async function run() {
    const tenantId = process.argv[2];
    if (!tenantId) {
        console.error('Please provide a tenantId');
        process.exit(1);
    }
    console.log(`Seeding defaults for tenant: ${tenantId}`);
    await settingsService.seedDefaults(tenantId);
    console.log('Done!');
}

run().catch(console.error);
