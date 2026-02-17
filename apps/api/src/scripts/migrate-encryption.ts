import 'dotenv/config';
import { db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { eq, like, notLike, or } from 'drizzle-orm';

async function migrate() {
    console.log('🚀 Starting encryption migration to V2...');

    try {
        // 1. Migrate Routers
        const allRouters = await db.select().from(schema.routers);
        console.log(`Checking ${allRouters.length} routers...`);

        for (const router of allRouters) {
            let updated = false;
            const updateData: any = {};

            // Main Password
            if (router.passwordEncrypted && !router.passwordEncrypted.startsWith('v2:')) {
                try {
                    const decrypted = decrypt(router.passwordEncrypted);
                    updateData.passwordEncrypted = encrypt(decrypted);
                    updated = true;
                } catch (e: any) {
                    console.error(`Failed to migrate main password for router ${router.name}:`, e.message);
                }
            }

            // GenieACS Password
            if (router.genieacsPasswordEncrypted && !router.genieacsPasswordEncrypted.startsWith('v2:')) {
                try {
                    const decrypted = decrypt(router.genieacsPasswordEncrypted);
                    updateData.genieacsPasswordEncrypted = encrypt(decrypted);
                    updated = true;
                } catch (e: any) {
                    console.error(`Failed to migrate GenieACS password for router ${router.name}:`, e.message);
                }
            }

            if (updated) {
                await db.update(schema.routers).set(updateData).where(eq(schema.routers.id, router.id));
                console.log(`✅ Migrated credentials for router: ${router.name}`);
            }
        }

        // 2. Migrate OLTs
        const allOlts = await db.select().from(schema.olts);
        console.log(`Checking ${allOlts.length} OLTs...`);

        for (const olt of allOlts) {
            if (olt.webPassword && !olt.webPassword.startsWith('v2:')) {
                try {
                    const decrypted = decrypt(olt.webPassword);
                    await db.update(schema.olts)
                        .set({ webPassword: encrypt(decrypted) })
                        .where(eq(schema.olts.id, olt.id));
                    console.log(`✅ Migrated password for OLT: ${olt.name}`);
                } catch (e: any) {
                    console.error(`Failed to migrate password for OLT ${olt.name}:`, e.message);
                }
            }
        }

        // 3. Migrate Global Settings
        const genieacsSetting = await db.select()
            .from(schema.appSettings)
            .where(eq(schema.appSettings.key, 'genieacs_password_encrypted'))
            .limit(1);

        if (genieacsSetting.length > 0 && genieacsSetting[0].value && !(genieacsSetting[0].value as string).startsWith('v2:')) {
            try {
                const decrypted = decrypt(genieacsSetting[0].value as string);
                await db.update(schema.appSettings)
                    .set({ value: encrypt(decrypted) })
                    .where(eq(schema.appSettings.key, 'genieacs_password_encrypted'));
                console.log('✅ Migrated global GenieACS password setting');
            } catch (e: any) {
                console.error('Failed to migrate global GenieACS password:', e.message);
            }
        }

        console.log('✨ Encryption migration complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
