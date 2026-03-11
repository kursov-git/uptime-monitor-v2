import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt, validateEncryptionConfig } from '../lib/crypto';

describe('crypto', () => {
    const originalKey = process.env.ENCRYPTION_KEY;

    afterAll(() => {
        // Restore original state
        if (originalKey) {
            process.env.ENCRYPTION_KEY = originalKey;
        } else {
            delete process.env.ENCRYPTION_KEY;
        }
    });

    describe('without ENCRYPTION_KEY', () => {
        beforeAll(() => {
            delete process.env.ENCRYPTION_KEY;
        });

        it('should return plaintext when no key is set', () => {
            const text = 'my-secret-bot-token';
            expect(encrypt(text)).toBe(text);
            expect(decrypt(text)).toBe(text);
        });

        it('should fail to decrypt encrypted values without a key', () => {
            expect(() => decrypt('enc:deadbeef:deadbeef:deadbeef')).toThrow(
                'Encrypted value found but ENCRYPTION_KEY is not set'
            );
        });
    });

    describe('with ENCRYPTION_KEY', () => {
        beforeAll(() => {
            // 32 bytes = 64 hex chars
            process.env.ENCRYPTION_KEY = 'a'.repeat(64);
        });

        it('should encrypt and decrypt correctly', () => {
            const text = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
            const encrypted = encrypt(text);

            expect(encrypted).not.toBe(text);
            expect(encrypted.startsWith('enc:')).toBe(true);
            expect(decrypt(encrypted)).toBe(text);
        });

        it('should produce different ciphertexts for same plaintext', () => {
            const text = 'same-token';
            const enc1 = encrypt(text);
            const enc2 = encrypt(text);

            expect(enc1).not.toBe(enc2); // Different IVs
            expect(decrypt(enc1)).toBe(text);
            expect(decrypt(enc2)).toBe(text);
        });

        it('should handle empty string', () => {
            const encrypted = encrypt('');
            expect(decrypt(encrypted)).toBe('');
        });

        it('should pass through non-encrypted values (backward compat)', () => {
            expect(decrypt('plain-text-value')).toBe('plain-text-value');
        });
    });

    describe('production validation', () => {
        const originalNodeEnv = process.env.NODE_ENV;

        afterAll(() => {
            if (originalNodeEnv) {
                process.env.NODE_ENV = originalNodeEnv;
            } else {
                delete process.env.NODE_ENV;
            }
        });

        it('requires ENCRYPTION_KEY in production', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.ENCRYPTION_KEY;
            expect(() => validateEncryptionConfig()).toThrow(
                'ENCRYPTION_KEY environment variable is required in production'
            );
        });

        it('rejects invalid production ENCRYPTION_KEY format', () => {
            process.env.NODE_ENV = 'production';
            process.env.ENCRYPTION_KEY = 'invalid-key';
            expect(() => validateEncryptionConfig()).toThrow(
                'ENCRYPTION_KEY must be a 64-character hex string'
            );
        });
    });
});
