import { describe, expect, it } from 'vitest';
import { buildMonitorData, downsampleHistoryResults } from '../routes/monitorRouteModel';

describe('buildMonitorData', () => {
    it('normalizes HTTP monitor fields', () => {
        expect(buildMonitorData({
            name: '  API  ',
            serviceName: '  Core  ',
            type: 'http',
            url: '  https://example.com/health  ',
            method: 'post',
            expectedBody: 'ready',
            requestBody: '{"ping":true}',
            sslExpiryEnabled: true,
            sslExpiryThresholdDays: 21,
        })).toMatchObject({
            name: 'API',
            serviceName: 'Core',
            type: 'HTTP',
            url: 'https://example.com/health',
            method: 'POST',
            expectedBody: 'ready',
            requestBody: '{"ping":true}',
            bodyAssertionType: 'AUTO',
            sslExpiryEnabled: true,
            sslExpiryThresholdDays: 21,
        });
    });

    it('uses protocol-specific defaults for TCP and DNS monitors', () => {
        expect(buildMonitorData({
            name: 'redis',
            type: 'TCP',
            url: 'tcp://redis.example.com:6379',
            method: 'POST',
            requestBody: 'ignored',
        })).toMatchObject({
            type: 'TCP',
            method: 'GET',
            expectedBody: null,
            requestBody: null,
            sslExpiryEnabled: false,
        });

        expect(buildMonitorData({
            name: 'dns',
            type: 'DNS',
            url: 'dns://example.com',
            dnsRecordType: 'txt',
            expectedBody: 'spf',
        })).toMatchObject({
            type: 'DNS',
            dnsRecordType: 'TXT',
            expectedBody: 'spf',
            bodyAssertionType: 'NONE',
        });
    });
});

describe('downsampleHistoryResults', () => {
    it('keeps newest, oldest, first failures, and response-time peaks', () => {
        const base = Date.UTC(2026, 0, 1, 0, 0, 0);
        const results = Array.from({ length: 8 }, (_, index) => ({
            id: String(index),
            timestamp: new Date(base + (7 - index) * 60_000),
            responseTimeMs: [10, 80, 20, 50, 100, 30, 70, 5][index],
            isUp: index !== 3,
        }));

        const sampled = downsampleHistoryResults(results, 4);

        expect(sampled.length).toBeLessThanOrEqual(4);
        expect(sampled[0].id).toBe('0');
        expect(sampled[sampled.length - 1].id).toBe('7');
        expect(sampled.some((entry) => entry.id === '3')).toBe(true);
        expect(sampled.some((entry) => entry.id === '4')).toBe(true);
    });
});
