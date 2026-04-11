import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { logger } from './logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Get encryption key from environment using a salt
 */
function deriveKey(salt: string | Buffer): Buffer {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    // Use scrypt to derive a proper 32-byte key from the secret and salt
    return scryptSync(secret, salt, 32);
}

/**
 * Encrypt a plain text string (V2 - with dynamic salt)
 * @param plainText - The text to encrypt
 * @returns Encrypted string in format: v2:salt:iv:authTag:encrypted (all base64)
 */
export function encrypt(plainText: string): string {
    const salt = randomBytes(SALT_LENGTH);
    const key = deriveKey(salt);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Return format: v2:salt:iv:authTag:encrypted (all base64)
    return [
        'v2',
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted,
    ].join(':');
}

/**
 * Decrypt an encrypted string (Supports legacy and V2)
 * @param encryptedText - The encrypted text
 * @param context - Optional context (e.g. router name) for logging
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string, context?: string): string {
    if (!encryptedText) return '';
    
    try {
        const parts = encryptedText.split(':');

        // V2 Format: v2:salt:iv:authTag:encrypted
        if (parts.length === 5 && parts[0] === 'v2') {
            const [, saltBase64, ivBase64, authTagBase64, encrypted] = parts;
            const salt = Buffer.from(saltBase64, 'base64');
            const iv = Buffer.from(ivBase64, 'base64');
            const authTag = Buffer.from(authTagBase64, 'base64');

            const key = deriveKey(salt);
            const decipher = createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }

        throw new Error('Invalid or unsupported encrypted text format (Required: v2)');
    } catch (error: any) {
        // Log the error but don't crash the entire request
        // This usually happens when ENCRYPTION_KEY has changed or format is legacy (now deprecated)
        logger.error({
            err: error.message,
            context: context || 'unknown',
            format: encryptedText.split(':')[0]
        }, '🚨 Decryption failed. This usually indicates an ENCRYPTION_KEY mismatch or unsupported legacy format.');
        
        return '';
    }
}
