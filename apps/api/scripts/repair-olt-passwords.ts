
import { db } from '../src/db/index.js';
import { olts } from '../src/db/schema/olts.js';
import { encrypt, decrypt } from '../src/lib/encryption.js';
import { eq } from 'drizzle-orm';

async function repairPasswords() {
    console.log('--- OLT Password Repair Tool ---');

    try {
        const allOlts = await db.select().from(olts);
        console.log(`Checking ${allOlts.length} OLTs...`);

        let fixedCount = 0;

        for (const olt of allOlts) {
            if (!olt.webPassword) continue;

            try {
                // Try to decrypt once
                const firstDecryption = decrypt(olt.webPassword);

                // Check if the result looks like another encrypted string (3 colons)
                const parts = firstDecryption.split(':');
                if (parts.length === 4) {
                    console.log(`[!] OLT "${olt.name}" has double-encrypted password. Fixing...`);

                    // Decrypt again to get the REAL plain text
                    const realPassword = decrypt(firstDecryption);

                    // Re-encrypt it properly (just once)
                    const fixedEncryption = encrypt(realPassword);

                    await db.update(olts)
                        .set({ webPassword: fixedEncryption })
                        .where(eq(olts.id, olt.id));

                    fixedCount++;
                }
            } catch (error) {
                console.warn(`[?] Could not decrypt password for OLT "${olt.name}". It might be plain text or manually edited.`);
            }
        }

        console.log(`\nRepair complete. Fixed ${fixedCount} OLTs.`);

    } catch (error) {
        console.error('Error during repair:', error);
    }

    process.exit(0);
}

repairPasswords();
