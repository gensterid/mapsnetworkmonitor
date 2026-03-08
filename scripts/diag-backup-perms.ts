import { connectToRouter } from '../apps/api/src/lib/mikrotik-api.js';
import { decrypt } from '../apps/api/src/lib/encryption.js';
import { db } from '../apps/api/src/db/index.js';
import { routers } from '../apps/api/src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Diagnostic script to pinpoint which MikroTik command fails with permission error
 */
async function diagBackupPermissions(routerId: string) {
    const router = await db.query.routers.findFirst({
        where: eq(routers.id, routerId)
    });

    if (!router) {
        console.error('Router not found');
        return;
    }

    console.log(`Testing permissions for router: ${router.name} (${router.host})`);
    
    try {
        const conn = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: decrypt(router.passwordEncrypted)
        });

        const testFile = `test-perm-${Date.now()}.backup`;

        console.log('1. Testing /system/backup/save...');
        try {
            await conn.write(['/system/backup/save', `=name=${testFile}`]);
            console.log('✅ /system/backup/save successful');
        } catch (err: any) {
            console.error('❌ /system/backup/save failed:', err.message);
        }

        console.log('2. Testing /tool/fetch (local head test)...');
        try {
            // Just a test fetch to a public URL to see if 'test' permission works
            await conn.write([
                '/tool/fetch',
                '=url=http://google.com',
                '=keep-result=no',
                '=check-certificate=no'
            ]);
            console.log('✅ /tool/fetch test successful');
        } catch (err: any) {
            console.error('❌ /tool/fetch test failed:', err.message);
        }

        console.log('3. Cleanup test file...');
        try {
            await conn.write(['/file/remove', `=numbers=${testFile}`]);
            console.log('✅ /file/remove successful');
        } catch (err: any) {
            console.error('⚠️ /file/remove failed (might be normal if save failed):', err.message);
        }

        conn.close();
    } catch (err: any) {
        console.error('Failed to connect or general error:', err.message);
    }
}

const routerId = process.argv[2];
if (!routerId) {
    console.log('Usage: node scripts/diag-backup-perms.ts <router-id>');
} else {
    diagBackupPermissions(routerId).then(() => process.exit());
}
