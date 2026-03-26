import crypto from 'crypto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
    calculateSseReconnectDelayMs,
    decryptAgentPayload,
    parseSseEvent,
    shouldResyncJobsFromSseEvent,
} from '../src/index';

describe('agent runtime helpers', () => {
    const originalKey = process.env.ENCRYPTION_KEY;

    beforeEach(() => {
        delete process.env.ENCRYPTION_KEY;
    });

    afterEach(() => {
        if (originalKey === undefined) {
            delete process.env.ENCRYPTION_KEY;
        } else {
            process.env.ENCRYPTION_KEY = originalKey;
        }
    });

    it('bounds SSE reconnect delay with capped exponential backoff', () => {
        expect(calculateSseReconnectDelayMs(1, 0)).toBe(2_000);
        expect(calculateSseReconnectDelayMs(2, 0)).toBe(4_000);
        expect(calculateSseReconnectDelayMs(3, 0.9)).toBe(8_450);
        expect(calculateSseReconnectDelayMs(10, 0.9)).toBe(30_000);
    });

    it('parses SSE events and detects resync-worthy commands', () => {
        const parsed = parseSseEvent([
            'id: 42',
            'event: agent.command',
            'data: {"command":"RESYNC_JOBS"}',
        ].join('\n'));

        expect(parsed).toEqual({
            lastEventId: 42,
            event: 'agent.command',
            payload: { command: 'RESYNC_JOBS' },
        });
        expect(shouldResyncJobsFromSseEvent(parsed?.event ?? '', parsed?.payload ?? null)).toBe(true);
        expect(shouldResyncJobsFromSseEvent('agent.command', { command: 'PING' })).toBe(false);
        expect(shouldResyncJobsFromSseEvent('monitor.upsert', null)).toBe(true);
    });

    it('returns null for SSE comments and keeps invalid JSON non-fatal', () => {
        expect(parseSseEvent(': keepalive')).toBeNull();
        expect(parseSseEvent('event: agent.command\ndata: {oops')).toEqual({
            lastEventId: null,
            event: 'agent.command',
            payload: null,
        });
    });

    it('decrypts encrypted payloads with the configured key', () => {
        const key = crypto.randomBytes(32);
        process.env.ENCRYPTION_KEY = key.toString('hex');

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update('grant_type=client_credentials', 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        const payload = `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;

        expect(decryptAgentPayload(payload, 1)).toBe('grant_type=client_credentials');
    });
});
