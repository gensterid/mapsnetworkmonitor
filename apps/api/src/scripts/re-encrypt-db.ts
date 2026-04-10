import 'dotenv/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

// --- Crypto Logic (Replicated from lib/encryption.ts to allow passing keys) ---

function deriveKey(secret: string, salt: Buffer): Buffer {
    return scryptSync(secret, salt, 32);
}

function decrypt(encryptedText: string, secret: string): string {
    if (!encryptedText) return '';
    try {
        const parts = encryptedText.split(':');
        if (parts.length === 5 && parts[0] === 'v2') {
            const [, saltBase64, ivBase64, authTagBase64, encrypted] = parts;
            const salt = Buffer.from(saltBase64, 'base64');
            const iv = Buffer.from(ivBase64, 'base64');
            const authTag = Buffer.from(authTagBase64, 'base64');

            const key = deriveKey(secret, salt);
            const decipher = createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        return '';
    } catch {
        return '';
    }
}

function encrypt(plainText: string, secret: string): string {
    if (!plainText) return '';
    const salt = randomBytes(SALT_LENGTH);
    const key = deriveKey(secret, salt);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return [
        'v2',
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted,
    ].join(':');
}

// --- Main Script Logic ---

async function run() {
    const prodKey = process.env.PROD_ENCRYPTION_KEY;
    const localKey = process.env.ENCRYPTION_KEY;

    if (!prodKey || !localKey) {
        console.error('❌ Error: Both PROD_ENCRYPTION_KEY and ENCRYPTION_KEY must be set.');
        process.exit(1);
    }

    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL not set.');
        process.exit(1);
    }

    console.log('🔄 Starting Re-Encryption Process...');
    const queryClient = postgres(process.env.DATABASE_URL);
    const db = drizzle(queryClient);

    try {
        // 1. Process Routers
        console.log('🛰️ Processing Routers...');
        const routers = await db.execute(sql`SELECT id, name, host, password_encrypted, genieacs_password_encrypted FROM routers`);
        
        let count = 0;
        for (const router of routers as any[]) {
            const updates: any = {};
            
            if (router.password_encrypted && router.password_encrypted.startsWith('v2:')) {
                const plain = decrypt(router.password_encrypted, prodKey);
                if (plain) {
                    updates.password_encrypted = encrypt(plain, localKey);
                }
            }

            if (router.genieacs_password_encrypted && router.genieacs_password_encrypted.startsWith('v2:')) {
                const plain = decrypt(router.genieacs_password_encrypted, prodKey);
                if (plain) {
                    updates.genieacs_password_encrypted = encrypt(plain, localKey);
                }
            }

            if (Object.keys(updates).length > 0) {
                await db.execute(sql`
                    UPDATE routers 
                    SET 
                        password_encrypted = ${updates.password_encrypted || router.password_encrypted},
                        genieacs_password_encrypted = ${updates.genieacs_password_encrypted || router.genieacs_password_encrypted}
                    WHERE id = ${router.id}
                `);
                count++;
            }
        }
        console.log(`✅ Routers processed: ${count}`);

        // 2. Process onus (if hardware passwords are encrypted there too)
        // ... adding similar logic if needed ...

        console.log('🎉 Re-encryption complete!');
    } catch (err) {
        console.error('❌ Re-encryption failed:', err);
    } finally {
        await queryClient.end();
    }
}

run();
