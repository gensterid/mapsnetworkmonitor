import { routerService } from './src/services/index.js';

async function testUpdate() {
    try {
        // Find first router
        const routers = await routerService.findAll();
        if (routers.length === 0) {
            console.log('No routers found to test.');
            process.exit(0);
        }

        const testId = routers[0].id;
        console.log(`Testing update for router ID: ${testId}`);

        // Update with GenieACS settings
        const updated = await routerService.update(testId, {
            useGenieAcs: true,
            genieacsUrl: 'http://test-acs:7557'
        });

        console.log('Update result keys:', Object.keys(updated || {}));
        console.log('Update result values:', {
            useGenieAcs: updated?.useGenieAcs,
            genieacsUrl: updated?.genieacsUrl
        });

        // Test findAll too
        const all = await routerService.findAll();
        console.log('First router from findAll keys:', Object.keys(all[0] || {}));
        console.log('First router from findAll GenieACS:', {
            useGenieAcs: all[0]?.useGenieAcs,
            genieacsUrl: all[0]?.genieacsUrl
        });

        if (updated?.useGenieAcs === true && updated?.genieacsUrl === 'http://test-acs:7557') {
            console.log('SUCCESS: GenieACS fields saved correctly!');
        } else {
            console.error('FAILURE: GenieACS fields NOT saved correctly!');
        }

        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

testUpdate();
