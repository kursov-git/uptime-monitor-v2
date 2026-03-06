import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer | null {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) return null;
    return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string. Returns base64-encoded ciphertext.
 * If ENCRYPTION_KEY is not set, returns plaintext as-is (backward compatible).
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    if (!key) return plaintext;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all hex)
    return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt ciphertext. If value doesn't start with 'enc:', assumes it's plaintext
 * (backward compatible with data written before encryption was enabled).
 */
export function decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith('enc:')) return ciphertext;

    const key = getKey();
    if (!key) {
        console.warn('⚠️  Encrypted value found but ENCRYPTION_KEY is not set');
        return ciphertext;
    }

    const parts = ciphertext.split(':');
    if (parts.length !== 4) return ciphertext;

    const [, ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
