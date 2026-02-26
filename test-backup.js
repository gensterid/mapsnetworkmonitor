import { backupService } from './apps/api/src/services/backup.service.js';
import { logger } from './apps/api/src/lib/logger.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './apps/api/.env' });

async function test() {
    try {
        console.log('Triggering manual backup test...');
        const path = await backupService.automatedBackup();
        console.log('Backup created at:', path);

        const list = await backupService.listBackups();
        console.log('Backup list:', list);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

test();
