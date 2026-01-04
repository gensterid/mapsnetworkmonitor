import 'dotenv/config';
import { routerService } from './src/services/router.service';
import { db } from './src/db';
import { routerNetwatch } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function testUpdateScenarios() {
    const routerId = '0d2538f3-d276-49ec-b3f8-667af8dd1f46';

    // Get first netwatch entry
    const [entry] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, routerId)).limit(1);

    if (!entry) {
        console.log('No netwatch entry found for testing');
        process.exit(0);
    }

    console.log('Testing different update scenarios...\n');
    console.log(`Entry: ${entry.host} (${entry.id})\n`);

    // Scenario 1: Update with all fields
    console.log('=== Test 1: Update with all fields ===');
    try {
        const result = await routerService.updateNetwatch(routerId, entry.id, {
            host: entry.host,
            name: 'Test Name',
            interval: 60,
            latitude: '-6.123',
            longitude: '106.456',
            location: 'Test Location'
        });
        console.log('✓ SUCCESS\n');
    } catch (e: any) {
        console.log('✗ FAILED:', e.message, '\n');
    }

    // Scenario 2: Update with only name (like from frontend)
    console.log('=== Test 2: Update only name ===');
    try {
        const result = await routerService.updateNetwatch(routerId, entry.id, {
            name: 'Updated Name'
        });
        console.log('✓ SUCCESS\n');
    } catch (e: any) {
        console.log('✗ FAILED:', e.message, '\n');
    }

    // Scenario 3: Update with empty strings (simulating frontend cleared fields)
    console.log('=== Test 3: Update with empty strings ===');
    try {
        const result = await routerService.updateNetwatch(routerId, entry.id, {
            name: '',
            latitude: '',
            longitude: '',
            location: ''
        });
        console.log('✓ SUCCESS\n');
    } catch (e: any) {
        console.log('✗ FAILED:', e.message, '\n');
    }

    // Scenario 4: Check what happens if we send exactly what frontend sends
    console.log('=== Test 4: Simulating exact frontend payload ===');
    const frontendPayload = {
        host: entry.host,
        name: 'Frontend Test',
        interval: 30
        // No latitude, longitude, location (not included in payload)
    };
    try {
        const result = await routerService.updateNetwatch(routerId, entry.id, frontendPayload);
        console.log('✓ SUCCESS\n');
    } catch (e: any) {
        console.log('✗ FAILED:', e.message);
        console.log('Full error:', e, '\n');
    }

    process.exit(0);
}

testUpdateScenarios();
