import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Get encryption key from environment
 */
function getKey(): Buffer {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    // Use scrypt to derive a proper 32-byte key from the secret
    return scryptSync(secret, 'salt', 32);
}

/**
 * Encrypt a plain text string
 * @param plainText - The text to encrypt
 * @returns Encrypted string in format: salt:iv:authTag:encrypted (all base64)
 */
export function encrypt(plainText: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const salt = randomBytes(SALT_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Return format: salt:iv:authTag:encrypted (all base64)
    return [
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted,
    ].join(':');
}

/**
 * Decrypt an encrypted string
 * @param encryptedText - The encrypted text in format: salt:iv:authTag:encrypted
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
    const key = getKey();
    const parts = encryptedText.split(':');

    if (parts.length !== 4) {
        throw new Error('Invalid encrypted text format');
    }

    const [, ivBase64, authTagBase64, encrypted] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
