import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
    buildBufferedResult,
    buildCheckInput,
    calculateSseReconnectDelayMs,
    decryptAgentPayload,
    parseSseEvent,
    shouldResyncJobsFromSseEvent,
    type AgentJob,
} from '../src/agentProtocol';

function job(overrides: Partial<AgentJob> = {}): AgentJob {
    return {
        monitorId: 'monitor-1',
        type: 'HTTP',
        url: 'https://example.test/health',
        method: 'POST',
        intervalSeconds: 60,
        timeoutMs: 7500,
        expectedStatus: 204,
        expectedBody: null,
        ...overrides,
    };
}

describe('agent runtime helpers', () => {
    it('maps agent jobs to checker input with runtime defaults', () => {
        expect(buildCheckInput(job(), 'token=abc', true)).toEqual({
            type: 'HTTP',
            url: 'https://example.test/health',
            dnsRecordType: 'A',
            method: 'POST',
            timeoutSeconds: 8,
            expectedStatus: 204,
            expectedBody: null,
            requestBody: null,
            bodyAssertionType: 'AUTO',
            bodyAssertionPath: null,
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: 'token=abc',
            authTokenRegex: null,
            sslExpiryEnabled: false,
            sslExpiryThresholdDays: 14,
            allowPrivateTargets: true,
        });
    });

    it('maps checker results into the agent result buffer contract', () => {
        expect(buildBufferedResult(job(), {
            isUp: false,
            responseTimeMs: 321,
            statusCode: 503,
            error: 'service unavailable',
            ssl: {
                expiresAt: '2026-07-01T00:00:00.000Z',
                daysRemaining: 20,
                issuer: 'Example CA',
                subject: 'example.test',
            },
        }, '2026-06-11T12:00:00.000Z', 'key-1')).toEqual({
            idempotencyKey: 'key-1',
            monitorId: 'monitor-1',
            checkedAt: '2026-06-11T12:00:00.000Z',
            isUp: false,
            responseTimeMs: 321,
            statusCode: 503,
            error: 'service unavailable',
            meta: {
                ssl: {
                    expiresAt: '2026-07-01T00:00:00.000Z',
                    daysRemaining: 20,
                    issuer: 'Example CA',
                    subject: 'example.test',
                },
            },
        });
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

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update('grant_type=client_credentials', 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        const payload = `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;

        expect(decryptAgentPayload(payload, 1, {
            encryptionKeysByVersion: {},
            fallbackEncryptionKey: key.toString('hex'),
        })).toBe('grant_type=client_credentials');
    });

});
