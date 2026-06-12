import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, validateEncryptionConfig } from '../lib/crypto';

describe('crypto', () => {
    const emptyEnv = {};
    const keyedEnv = { ENCRYPTION_KEY: 'a'.repeat(64) };

    describe('without ENCRYPTION_KEY', () => {
        it('should return plaintext when no key is set', () => {
            const text = 'my-secret-bot-token';
            expect(encrypt(text, emptyEnv)).toBe(text);
            expect(decrypt(text, emptyEnv)).toBe(text);
        });

        it('should fail to decrypt encrypted values without a key', () => {
            expect(() => decrypt('enc:deadbeef:deadbeef:deadbeef', emptyEnv)).toThrow(
                'Encrypted value found but ENCRYPTION_KEY is not set'
            );
        });
    });

    describe('with ENCRYPTION_KEY', () => {
        it('should encrypt and decrypt correctly', () => {
            const text = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
            const encrypted = encrypt(text, keyedEnv);

            expect(encrypted).not.toBe(text);
            expect(encrypted.startsWith('enc:')).toBe(true);
            expect(decrypt(encrypted, keyedEnv)).toBe(text);
        });

        it('should produce different ciphertexts for same plaintext', () => {
            const text = 'same-token';
            const enc1 = encrypt(text, keyedEnv);
            const enc2 = encrypt(text, keyedEnv);

            expect(enc1).not.toBe(enc2); // Different IVs
            expect(decrypt(enc1, keyedEnv)).toBe(text);
            expect(decrypt(enc2, keyedEnv)).toBe(text);
        });

        it('should handle empty string', () => {
            const encrypted = encrypt('', keyedEnv);
            expect(decrypt(encrypted, keyedEnv)).toBe('');
        });

        it('should pass through non-encrypted values (backward compat)', () => {
            expect(decrypt('plain-text-value', emptyEnv)).toBe('plain-text-value');
        });
    });

    describe('production validation', () => {
        it('requires ENCRYPTION_KEY in production', () => {
            expect(() => validateEncryptionConfig({ NODE_ENV: 'production' })).toThrow(
                'ENCRYPTION_KEY environment variable is required in production'
            );
        });

        it('rejects invalid production ENCRYPTION_KEY format', () => {
            expect(() => validateEncryptionConfig({
                NODE_ENV: 'production',
                ENCRYPTION_KEY: 'invalid-key',
            })).toThrow(
                'ENCRYPTION_KEY must be a 64-character hex string'
            );
        });

        it('accepts a valid production ENCRYPTION_KEY', () => {
            expect(() => validateEncryptionConfig({
                NODE_ENV: 'production',
                ENCRYPTION_KEY: 'a'.repeat(64),
            })).not.toThrow();
        });
    });
});
