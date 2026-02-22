import { oltService } from './apps/api/src/services/olt.service.js';

async function testSync() {
    console.log('Testing OLT Sync to catch the 409 error...');
    try {
        // The user had an error on: /api/olts/8c2ac0a3-9517-4157-8da5-9b77277dbda5/onus
        const oltId = '8c2ac0a3-9517-4157-8da5-9b77277dbda5';
        await oltService.getOnus(oltId);
        console.log('Sync successful.');
    } catch (err: any) {
        console.error('Caught Error:', err.message);
        if (err.detail) {
            console.error('Detail:', err.detail);
        }
        if (err.table) {
            console.error('Table:', err.table);
        }
        if (err.constraint) {
            console.error('Constraint:', err.constraint);
        }
        console.error(err);
    } finally {
        process.exit(0);
    }
}

testSync();
