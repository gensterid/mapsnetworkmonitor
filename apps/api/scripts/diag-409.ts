import { oltService } from '../src/services/olt.service.js';
import { logger } from '../src/lib/logger.js';

async function main() {
    console.log('[DIAG] Starting OLT sync for debugging 409 Error...');
    const oltId = '8c2ac0a3-9517-4157-8da5-9b77277dbda5'; // User's C-Data OLT

    try {
        const onus = await oltService.getOnus(oltId);
        console.log(`[DIAG] Success! Synced ${onus.length} ONUs.`);
    } catch (err: any) {
        console.error('[DIAG] ERROR CAUGHT DURING SYNC:');
        console.error('Message:', err.message);
        console.error('Code:', err.code);
        console.error('Constraint:', err.constraint);
        console.error('Detail:', err.detail);
        console.error('Table:', err.table);
        console.error('Full Error:', err);
    } finally {
        process.exit(0);
    }
}

main();
