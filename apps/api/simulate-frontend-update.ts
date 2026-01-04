import 'dotenv/config';
import express from 'express';
import { db } from './src/db';
import { routers, routerNetwatch } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { routerService } from './src/services/router.service';

// Simulate an HTTP request update
async function simulateFrontendUpdate() {
    // Get test data
    const [router] = await db.select().from(routers).limit(1);
    const [nw] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, router.id)).limit(1);

    if (!router || !nw) {
        console.log('No test data available');
        process.exit(0);
    }

    console.log(`Testing update for: ${nw.host}\n`);

    // Simulate exact payload from frontend (based on RouterDetails.jsx code)
    const frontendPayload = {
        host: nw.host,
        name: 'Test Update from Simulation',
        interval: 30,
        // These might be empty strings if user cleared them
        latitude: '',
        longitude: '',
        location: ''
    };

    console.log('Frontend payload:', frontendPayload);

    // Clean like backend does
    const cleanedBody = Object.fromEntries(
        Object.entries(frontendPayload).filter(([_, v]) => v !== undefined)
    );

    console.log('Cleaned body:', cleanedBody);

    // Try update
    try {
        const result = await routerService.updateNetwatch(router.id, nw.id, cleanedBody);
        console.log('\n✓ UPDATE SUCCESS!');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error: any) {
        console.log('\n✗ UPDATE FAILED!');
        console.log('Error message:', error.message);
        console.log('\nFull error:', error);

        if (error.cause) {
            console.log('\nError cause:', error.cause);
        }
    }

    process.exit(0);
}

simulateFrontendUpdate();
