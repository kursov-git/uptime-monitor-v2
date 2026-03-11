import { describe, expect, it } from 'vitest';
import { resolveServerRole } from '../lib/serverRoles';

describe('resolveServerRole', () => {
    it('defaults to all when unset', () => {
        expect(resolveServerRole(undefined)).toBe('all');
    });

    it('accepts known roles', () => {
        expect(resolveServerRole('api')).toBe('api');
        expect(resolveServerRole('worker')).toBe('worker');
        expect(resolveServerRole('retention')).toBe('retention');
        expect(resolveServerRole('agent-offline-monitor')).toBe('agent-offline-monitor');
    });

    it('normalizes case and surrounding spaces', () => {
        expect(resolveServerRole(' Worker ')).toBe('worker');
    });

    it('rejects invalid roles', () => {
        expect(() => resolveServerRole('scheduler')).toThrow(/Invalid SERVER_ROLE/);
    });
});
