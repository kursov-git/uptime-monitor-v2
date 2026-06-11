import { describe, expect, it } from 'vitest';
import type { CheckResult, Monitor } from '../api';
import { buildMonitorHistorySummary } from '../lib/monitorHistorySummary';

function result(overrides: Partial<CheckResult> = {}): CheckResult {
    return {
        id: 'result-1',
        monitorId: 'monitor-1',
        timestamp: '2026-03-20T11:40:00.000Z',
        isUp: true,
        responseTimeMs: 120,
        statusCode: 200,
        error: null,
        ...overrides,
    };
}

function monitor(overrides: Partial<Monitor> = {}): Monitor {
    return {
        id: 'monitor-1',
        name: 'API',
        serviceName: null,
        type: 'HTTP',
        url: 'https://example.com/health',
        dnsRecordType: 'A',
        agentId: null,
        agentName: null,
        method: 'GET',
        intervalSeconds: 60,
        timeoutSeconds: 30,
        expectedStatus: 200,
        expectedBody: null,
        requestBody: null,
        bodyAssertionType: 'NONE',
        bodyAssertionPath: null,
        headers: null,
        authMethod: 'NONE',
        authUrl: null,
        authPayload: null,
        authTokenRegex: null,
        sslExpiryEnabled: true,
        sslExpiryThresholdDays: 14,
        isActive: true,
        isPublic: false,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T11:40:00.000Z',
        lastCheck: null,
        flappingState: null,
        ...overrides,
    };
}

function summary(overrides: Partial<Parameters<typeof buildMonitorHistorySummary>[0]> = {}) {
    return buildMonitorHistorySummary({
        monitor: monitor(),
        results: [],
        chartResults: [],
        total: 0,
        pageSize: 50,
        offset: 0,
        overallUptime: '—',
        overallAvgRes: 0,
        ...overrides,
    });
}

describe('buildMonitorHistorySummary', () => {
    it('reports status and type labels from monitor state', () => {
        expect(summary({
            monitor: monitor({ isActive: false }),
        }).latestStatus).toBe('paused');

        expect(summary({
            monitor: monitor({ flappingState: { isFlapping: true, consecutiveFailures: 2, firstFailureTime: null, lastError: 'timeout' } }),
        }).latestStatus).toBe('flapping');

        expect(summary({
            monitor: monitor({ type: 'DNS', dnsRecordType: 'TXT' }),
        }).monitorTypeLabel).toBe('DNS TXT');
    });

    it('uses current page, totals, and latest result from paged results first', () => {
        const latest = result({ id: 'paged-latest', isUp: false, statusCode: 503 });
        const view = summary({
            results: [latest],
            chartResults: [result({ id: 'chart-latest', isUp: true })],
            total: 125,
            pageSize: 50,
            offset: 50,
            overallUptime: '99.5',
            overallAvgRes: 133,
        });

        expect(view.latestResult?.id).toBe('paged-latest');
        expect(view.latestStatus).toBe('down');
        expect(view.totalPages).toBe(3);
        expect(view.currentPage).toBe(2);
        expect(view.uptimePercent).toBe('99.5');
        expect(view.avgResponseTime).toBe(133);
    });

    it('summarizes SSL expiry and TLS failure states', () => {
        expect(summary({
            results: [result({ sslDaysRemaining: 7, sslExpiresAt: '2026-03-27T00:00:00.000Z', sslIssuer: 'CA', sslSubject: 'example.com' })],
        }).sslSummary).toMatchObject({
            label: '7 days left',
            warning: true,
            issuer: 'CA',
        });

        expect(summary({
            results: [result({ isUp: false, error: 'write EPROTO sslv3 alert handshake failure' })],
        }).sslSummary).toMatchObject({
            label: 'TLS handshake failed',
            warning: true,
        });
    });
});
