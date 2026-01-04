import 'dotenv/config';
import { db } from './src/db';
import { routers } from './src/db/schema';
import { connectToRouter } from './src/lib/mikrotik-api';
import { decrypt } from './src/lib/encryption';

async function testRouterPermissions(routerId: string) {
    const [router] = await db.select().from(routers).where((r) => r.id === routerId);

    if (!router) {
        console.error('Router not found');
        return;
    }

    console.log(`\n=== Testing Router: ${router.name} (${router.host}) ===\n`);

    const password = decrypt(router.passwordEncrypted);

    try {
        const api = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: password,
        });

        console.log('✓ Connection successful');

        // Test 1: Read netwatch
        try {
            const netwatch = await api.write('/tool/netwatch/print');
            console.log(`✓ Can READ netwatch (${netwatch.length} entries)`);
        } catch (e: any) {
            console.log(`✗ Cannot READ netwatch: ${e.message}`);
        }

        // Test 2: Get user info
        try {
            const users = await api.write('/user/print', [`?name=${router.username}`]);
            if (users.length > 0) {
                const user = users[0];
                console.log(`\nUser Info:`);
                console.log(`  Name: ${user.name}`);
                console.log(`  Group: ${user.group}`);
            }
        } catch (e: any) {
            console.log(`Cannot get user info: ${e.message}`);
        }

        // Test 3: Get group permissions
        try {
            const groups = await api.write('/user/group/print');
            console.log(`\nAvailable Groups & Permissions:`);
            groups.forEach((g: any) => {
                console.log(`  ${g.name}: ${g.policy}`);
            });
        } catch (e: any) {
            console.log(`Cannot get groups: ${e.message}`);
        }

        // Test 4: Try to add a test netwatch entry
        console.log(`\n--- Testing Write Permission ---`);
        try {
            await api.write('/tool/netwatch/add', [
                '=host=1.1.1.1',
                '=interval=1m',
                '=comment=TEST_PERMISSION_CHECK'
            ]);
            console.log('✓ Can ADD netwatch entry');

            // Clean up - remove the test entry
            const entries = await api.write('/tool/netwatch/print', ['?comment=TEST_PERMISSION_CHECK']);
            if (entries.length > 0) {
                await api.write('/tool/netwatch/remove', [`=.id=${entries[0]['.id']}`]);
                console.log('✓ Can DELETE netwatch entry (cleanup successful)');
            }
        } catch (e: any) {
            console.log(`✗ Cannot ADD netwatch: ${e.message}`);
            if (e.message.includes('not enough permissions')) {
                console.log('\n⚠ PERMISSION ISSUE DETECTED!');
                console.log('The user needs additional permissions. Required policies:');
                console.log('  - read, write, policy, test');
                console.log('\nTo fix: /user/group/set [find name=<groupname>] policy=read,write,policy,test,api');
            }
        }

        // Test 5: Try to modify existing netwatch
        try {
            const entries = await api.write('/tool/netwatch/print');
            if (entries.length > 0) {
                const firstEntry = entries[0];
                console.log(`\nTrying to modify entry: ${firstEntry.host}`);

                await api.write('/tool/netwatch/set', [
                    `=.id=${firstEntry['.id']}`,
                    `=comment=${firstEntry.comment || ''}_test`
                ]);
                console.log('✓ Can UPDATE netwatch entry');

                // Revert
                await api.write('/tool/netwatch/set', [
                    `=.id=${firstEntry['.id']}`,
                    `=comment=${firstEntry.comment || ''}`
                ]);
                console.log('✓ Reverted update');
            }
        } catch (e: any) {
            console.log(`✗ Cannot UPDATE netwatch: ${e.message}`);
        }

        api.close();
        console.log('\n--- Test Complete ---\n');

    } catch (e: any) {
        console.error(`Connection failed: ${e.message}`);
    }
}

// Get router ID from command line or test all
async function main() {
    const routerId = process.argv[2];

    if (routerId) {
        await testRouterPermissions(routerId);
    } else {
        // Test all routers
        const allRouters = await db.select().from(routers);
        console.log(`Found ${allRouters.length} routers. Testing each...\n`);

        for (const router of allRouters) {
            await testRouterPermissions(router.id);
        }
    }

    process.exit(0);
}

main();
