import { describe, expect, it } from 'vitest';
import { envBool } from '../lib/utils';

describe('envBool', () => {
    it('returns default value when env var is undefined', () => {
        delete process.env.TEST_BOOL_UNDEF;
        expect(envBool('TEST_BOOL_UNDEF', true)).toBe(true);
        expect(envBool('TEST_BOOL_UNDEF', false)).toBe(false);
    });

    it('parses truthy values', () => {
        process.env.TEST_BOOL_TRUE = 'TRUE';
        expect(envBool('TEST_BOOL_TRUE', false)).toBe(true);

        process.env.TEST_BOOL_ON = 'on';
        expect(envBool('TEST_BOOL_ON', false)).toBe(true);
    });

    it('returns false for non-truthy values', () => {
        process.env.TEST_BOOL_FALSE = '0';
        expect(envBool('TEST_BOOL_FALSE', true)).toBe(false);
    });
});
