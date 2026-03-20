import 'dotenv/config';
import { oltService } from './src/services/olt.service.js';
import { logger } from './src/lib/logger.js';

async function test() {
    try {
        console.log('Testing OLT getOnus for ID: 63bfb5eb-33bd-4622-a633-e90d2f7f754c');
        const onus = await oltService.getOnus('63bfb5eb-33bd-4622-a633-e90d2f7f754c');
        console.log('SUCCESS:', onus.length, 'ONUs found');
    } catch (err) {
        console.error('FAILED with error:');
        console.error(err);
    }
    process.exit(0);
}

test();
