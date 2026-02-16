import { oltService } from './src/services/olt.service';
import { db } from './src/db';
import { olts } from './src/db/schema/olts';
import { onus } from './src/db/schema/onus';
import { eq } from 'drizzle-orm';

async function verifySync() {
    console.log('--- Starting Verification for syncOnuInventory ---');

    // 1. Get an existing OLT (or create a mock one if needed, but better to use existing for real test)
    // For safety, let's list OLTs first
    const allOlts = await oltService.findAll();

    if (allOlts.length === 0) {
        console.log('No OLTs found. Cannot verify sync without an OLT.');
        process.exit(0);
    }

    const targetOlt = allOlts[0];
    console.log(`Target OLT: ${targetOlt.name} (${targetOlt.host})`);

    // 2. Trigger Sync
    console.log('Triggering sync...');
    try {
        const result = await oltService.syncOnuInventory(targetOlt.id);
        console.log('Sync Result:', result);

        // 3. Verify DB Content
        const onusList = await db.select().from(onus).where(eq(onus.oltId, targetOlt.id));
        console.log(`DB Verification: Found ${onusList.length} ONUs in database for this OLT.`);

        if (onusList.length > 0) {
            console.log('Sample ONU:', {
                sn: onusList[0].sn,
                status: onusList[0].status,
                discoverySources: onusList[0].discoverySources
            });

            // Validation
            const hasSource = (onusList[0].discoverySources as string[])?.includes('olt');
            if (hasSource) {
                console.log('✅ SUCCESS: Discovery Source "olt" is correctly set.');
            } else {
                console.error('❌ FAILED: Discovery Source "olt" is missing.');
            }
        }
    } catch (e) {
        console.error('❌ Sync Failed:', e);
    }

    process.exit(0);
}

verifySync();
