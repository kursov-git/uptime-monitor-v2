import { describe, expect, it } from 'vitest';
import {
    buildServiceGroups,
    formatAvailabilityValue,
    getAverageUptime,
    getHeadlineBadge,
    getIncidentLabel,
    getIncidentSummary,
    getIncidentTone,
    getPublicHeadline,
    getPublicStatusErrorMessage,
    getServiceGroupStatus,
} from '../lib/publicStatusView';
import type { PublicStatusBucket, PublicStatusResponse } from '../api';

function bucket(overrides: Partial<PublicStatusBucket> = {}): PublicStatusBucket {
    return {
        timestamp: '2026-03-12T00:00:00.000Z',
        totalChecks: 4,
        upChecks: 4,
        uptimePercent: 100,
        avgResponseTimeMs: 120,
        ...overrides,
    };
}

function monitor(overrides: Partial<PublicStatusResponse['monitors'][number]> = {}): PublicStatusResponse['monitors'][number] {
    return {
        id: 'monitor-1',
        name: 'Homepage',
        serviceName: 'Website',
        type: 'HTTP',
        url: 'https://example.com',
        dnsRecordType: 'A',
        method: 'GET',
        isActive: true,
        status: 'up',
        lastCheck: null,
        uptimePercent24h: '99.0',
        history24h: [],
        ...overrides,
    };
}

describe('publicStatusView helpers', () => {
    it('summarizes incident buckets by operational impact', () => {
        const degraded = bucket({ upChecks: 3, uptimePercent: 75 });
        const outage = bucket({ upChecks: 0, uptimePercent: 0 });
        const noData = bucket({ totalChecks: 0, upChecks: 0, uptimePercent: null, avgResponseTimeMs: null });

        expect(getIncidentTone(degraded)).toBe('degraded');
        expect(getIncidentLabel(outage)).toBe('Outage');
        expect(getIncidentSummary([bucket(), degraded, outage, noData])).toBe('2 impacted hours · 1 hour has no data');
    });

    it('prioritizes public headline states from most severe to normal', () => {
        expect(getPublicHeadline({ up: 1, down: 1, paused: 1, unknown: 1 }, 4).tone).toBe('down');
        expect(getPublicHeadline({ up: 1, down: 0, paused: 1, unknown: 1 }, 3).tone).toBe('unknown');
        expect(getPublicHeadline({ up: 1, down: 0, paused: 1, unknown: 0 }, 2).tone).toBe('paused');
        expect(getPublicHeadline({ up: 2, down: 0, paused: 0, unknown: 0 }, 2).tone).toBe('up');
        expect(getPublicHeadline({ up: 0, down: 0, paused: 0, unknown: 0 }, 0).tone).toBe('empty');
    });

    it('maps headline tone to the public status badge contract', () => {
        expect(getHeadlineBadge('down')).toEqual({ className: 'down', label: 'Attention' });
        expect(getHeadlineBadge('up')).toEqual({ className: 'up', label: 'Operational' });
        expect(getHeadlineBadge('paused')).toEqual({ className: 'paused', label: 'Paused' });
        expect(getHeadlineBadge('unknown')).toEqual({ className: 'flapping', label: 'Watch' });
        expect(getHeadlineBadge('empty')).toEqual({ className: 'flapping', label: 'Watch' });
    });

    it('groups public monitors by service and keeps standalone checks last', () => {
        const groups = buildServiceGroups([
            monitor({ id: 'standalone', serviceName: null }),
            monitor({ id: 'billing-1', serviceName: 'Billing' }),
            monitor({ id: 'api-1', serviceName: 'API' }),
            monitor({ id: 'billing-2', serviceName: 'Billing' }),
            monitor({ id: 'blank', serviceName: '   ' }),
        ]);

        expect(groups.map(([label]) => label)).toEqual(['API', 'Billing', 'Standalone checks']);
        expect(groups[1][1].map((entry) => entry.id)).toEqual(['billing-1', 'billing-2']);
        expect(groups[2][1].map((entry) => entry.id)).toEqual(['standalone', 'blank']);
    });

    it('aggregates service status and uptime from monitor contracts', () => {
        expect(getServiceGroupStatus([monitor(), monitor({ status: 'down' })])).toBe('down');
        expect(getServiceGroupStatus([monitor({ uptimePercent24h: '95.0' }), monitor({ uptimePercent24h: '99.0' })])).toBe('up');
        expect(getAverageUptime([monitor({ uptimePercent24h: '95.0' }), monitor({ uptimePercent24h: '99.0' })])).toBe('97.0');
        expect(formatAvailabilityValue(null)).toBe('—');
    });

    it('extracts API error messages without trusting arbitrary thrown values', () => {
        expect(getPublicStatusErrorMessage({
            response: { data: { error: 'backend says no' } },
            message: 'axios fallback',
        }, 'generic')).toBe('backend says no');
        expect(getPublicStatusErrorMessage({ message: 'network failed' }, 'generic')).toBe('network failed');
        expect(getPublicStatusErrorMessage('boom', 'generic')).toBe('generic');
    });
});
