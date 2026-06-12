import { describe, expect, it } from 'vitest';
import { envBool, parseBoolEnv } from '../lib/utils';

describe('parseBoolEnv', () => {
    it('returns the default when value is undefined', () => {
        expect(parseBoolEnv(undefined, true)).toBe(true);
        expect(parseBoolEnv(undefined, false)).toBe(false);
    });

    it('parses truthy values', () => {
        expect(parseBoolEnv('TRUE', false)).toBe(true);
        expect(parseBoolEnv('on', false)).toBe(true);
        expect(parseBoolEnv('yes', false)).toBe(true);
        expect(parseBoolEnv('1', false)).toBe(true);
    });

    it('returns false for non-truthy values', () => {
        expect(parseBoolEnv('0', true)).toBe(false);
        expect(parseBoolEnv('false', true)).toBe(false);
        expect(parseBoolEnv('', true)).toBe(false);
    });
});

describe('envBool', () => {
    it('reads a named value from the provided source', () => {
        expect(envBool('FEATURE_FLAG', false, { FEATURE_FLAG: 'true' })).toBe(true);
        expect(envBool('FEATURE_FLAG', true, { FEATURE_FLAG: 'off' })).toBe(false);
    });

    it('uses the default when the named value is absent', () => {
        expect(envBool('FEATURE_FLAG', true, {})).toBe(true);
        expect(envBool('FEATURE_FLAG', false, {})).toBe(false);
    });
});
