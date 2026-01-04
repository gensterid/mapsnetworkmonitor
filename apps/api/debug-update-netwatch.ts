import 'dotenv/config';
import { routerService } from './src/services/router.service';

async function testUpdate() {
    const routerId = '0d2538f3-d276-49ec-b3f8-667af8dd1f46'; // DEDI router
    const netwatchId = '6522a180-a128-4843-b642-a54544ba5312';

    console.log('Testing netwatch update...\n');
    console.log(`Router ID: ${routerId}`);
    console.log(`Netwatch ID: ${netwatchId}\n`);

    try {
        const result = await routerService.updateNetwatch(routerId, netwatchId, {
            comment: 'Test update from debug script'
        });

        console.log('✓ Update SUCCESS!');
        console.log('Result:', result);
    } catch (error: any) {
        console.log('✗ Update FAILED!');
        console.log('Error:', error.message);
        console.log('\nFull error:');
        console.error(error);

        if (error.stack) {
            console.log('\nStack trace:');
            console.log(error.stack);
        }
    }

    process.exit(0);
}

testUpdate();
