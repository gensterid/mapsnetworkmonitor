
import 'dotenv/config';
import { pppoeService } from './src/services/pppoe.service';

async function main() {
    console.log('Testing pppoeService.findAllWithCoordinates...');
    try {
        // Simulate an admin call (no filters)
        console.log('--- Case 1: Admin (No User/Role) ---');
        const resultsAdmin = await pppoeService.findAllWithCoordinates();
        console.log(`Success! Found ${resultsAdmin.length} sessions.`);
        resultsAdmin.forEach(s => {
            console.log(` - ${s.name}: ${s.latitude}, ${s.longitude}`);
        });

        // Simulate an operator call (with mock user ID)
        // I won't pass filters initially to minimize variables, but can add if needed.

    } catch (error: any) {
        console.error('CRITICAL FAILURE:', error);
        if (error.stack) {
            console.error(error.stack);
        }
    } finally {
        process.exit(0);
    }
}

main();
