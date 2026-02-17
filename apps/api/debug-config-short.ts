import { settingsService } from './src/services/settings.service.js';
import { decrypt } from './src/lib/encryption.js';
import dotenv from 'dotenv';
dotenv.config();

async function debugConfig() {
    try {
        console.log('--- GenieACS Configuration Debug ---');

        const urlSetting = await settingsService.getSetting('genieacs_url') as any;
        const userSetting = await settingsService.getSetting('genieacs_username') as any;
        const passSetting = await settingsService.getSetting('genieacs_password_encrypted') as any;

        console.log('Database Settings:');
        console.log(`- genieacs_url: [${urlSetting?.value}]`);
        console.log(`- genieacs_username: [${userSetting?.value}]`);
        console.log(`- genieacs_password_encrypted: [${passSetting?.value ? 'PRESENT' : 'MISSING'}]`);

        if (passSetting?.value) {
            try {
                const dec = decrypt(passSetting.value);
                console.log(`- Decrypted Password: [${dec ? 'SUCCESS' : 'EMPTY'}]`);
            } catch (e: any) {
                console.log(`- Decrypted Password: [FAILED: ${e.message}]`);
            }
        }

        console.log('\nEnvironment Variables:');
        console.log(`- GENIEACS_URL: [${process.env.GENIEACS_URL}]`);
        console.log(`- GENIEACS_USERNAME: [${process.env.GENIEACS_USERNAME}]`);

        process.exit(0);
    } catch (error) {
        console.error('Debug script failed:', error);
        process.exit(1);
    }
}

debugConfig();
