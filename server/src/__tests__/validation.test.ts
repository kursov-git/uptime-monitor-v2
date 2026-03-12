import { describe, it, expect } from 'vitest';
import { isValidUrl, isValidJson, validateMonitorInput, validateMonitorInputWithOptions } from '../lib/validation';

describe('isValidUrl', () => {
    it('should accept valid HTTP URLs', () => {
        expect(isValidUrl('http://example.com')).toBe(true);
        expect(isValidUrl('https://example.com')).toBe(true);
        expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
    });

    it('should reject invalid URLs', () => {
        expect(isValidUrl('')).toBe(false);
        expect(isValidUrl('not-a-url')).toBe(false);
        expect(isValidUrl('ftp://example.com')).toBe(false);
    });
});

describe('isValidJson', () => {
    it('should accept valid JSON', () => {
        expect(isValidJson('{"key": "value"}')).toBe(true);
        expect(isValidJson('[]')).toBe(true);
    });

    it('should accept undefined/null (optional)', () => {
        expect(isValidJson(undefined)).toBe(true);
        expect(isValidJson(null)).toBe(true);
    });

    it('should reject invalid JSON', () => {
        expect(isValidJson('{invalid}')).toBe(false);
        expect(isValidJson('not json')).toBe(false);
    });
});

describe('validateMonitorInput', () => {
    it('should reject empty name', () => {
        const errors = validateMonitorInput({ name: '', url: 'https://example.com' });
        expect(errors.some(e => e.field === 'name')).toBe(true);
    });

    it('should reject invalid URL', () => {
        const errors = validateMonitorInput({ name: 'Test', url: 'not-valid' });
        expect(errors.some(e => e.field === 'url')).toBe(true);
    });

    it('should reject interval out of range', () => {
        const errors = validateMonitorInput({
            name: 'Test',
            url: 'https://example.com',
            intervalSeconds: 0.01,
        });
        expect(errors.some(e => e.field === 'intervalSeconds')).toBe(true);
    });

    it('should accept valid input', () => {
        const errors = validateMonitorInput({
            name: 'Test Monitor',
            url: 'https://example.com',
            intervalSeconds: 5,
            expectedStatus: 200,
        });
        expect(errors).toHaveLength(0);
    });

    it('should reject loopback monitor targets by default', () => {
        const errors = validateMonitorInput({
            name: 'Internal Monitor',
            url: 'http://127.0.0.1:8080/health',
        });

        expect(errors).toContainEqual({
            field: 'url',
            message: 'Target URL is not allowed: loopback',
        });
    });

    it('should reject private auth urls by default', () => {
        const errors = validateMonitorInput({
            name: 'Form Login Monitor',
            url: 'https://example.com/health',
            authMethod: 'FORM_LOGIN',
            authUrl: 'http://192.168.1.10/login',
            authPayload: '{"username":"test","password":"secret"}',
        });

        expect(errors).toContainEqual({
            field: 'authUrl',
            message: 'Auth URL is not allowed: rfc1918-private',
        });
    });

    it('should allow private targets when explicitly enabled', () => {
        const errors = validateMonitorInputWithOptions({
            name: 'Private Monitor',
            url: 'http://10.0.0.15/health',
        }, {
            allowPrivateTargets: true,
        });

        expect(errors).toHaveLength(0);
    });
});
