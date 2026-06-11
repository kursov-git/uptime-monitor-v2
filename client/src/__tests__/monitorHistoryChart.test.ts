import { describe, expect, it } from 'vitest';
import {
    buildChartTickIndexes,
    detailCheckError,
    downsampleChartData,
    getChartHoverIndex,
    summarizeCheckError,
} from '../lib/monitorHistoryChart';
import type { ChartPoint } from '../lib/monitorHistoryChart';

function point(index: number, overrides: Partial<ChartPoint> = {}): ChartPoint {
    return {
        index,
        time: `t${index}`,
        timeLabel: `T${index}`,
        timestampMs: index * 60_000,
        responseTime: 100 + index,
        isUp: true,
        statusCode: 200,
        ...overrides,
    };
}

describe('monitorHistoryChart helpers', () => {
    it('downsamples dense data while preserving failures and response peaks', () => {
        const data = [
            point(0, { responseTime: 100 }),
            point(1, { responseTime: 120 }),
            point(2, { isUp: false, responseTime: 80, statusCode: 500 }),
            point(3, { responseTime: 900 }),
            point(4, { responseTime: 160 }),
            point(5, { responseTime: 180 }),
        ];

        const sampled = downsampleChartData(data, 4);

        expect(sampled[0].timestampMs).toBe(data[0].timestampMs);
        expect(sampled[sampled.length - 1].timestampMs).toBe(data[data.length - 1].timestampMs);
        expect(sampled.some((entry) => !entry.isUp)).toBe(true);
        expect(sampled.some((entry) => entry.responseTime === 900)).toBe(true);
        expect(sampled.map((entry) => entry.index)).toEqual(sampled.map((_, index) => index));
    });

    it('builds stable chart tick indexes with first and last points included', () => {
        const ticks = buildChartTickIndexes(
            [0, 1, 2, 3].map((index) => point(index, { timestampMs: index * 15 * 60_000 })),
            45 * 60_000,
        );

        expect(ticks[0]).toBe(0);
        expect(ticks[ticks.length - 1]).toBe(3);
        expect(ticks).toEqual([...new Set(ticks)].sort((a, b) => a - b));
    });

    it('normalizes chart hover state without trusting arbitrary event shapes', () => {
        expect(getChartHoverIndex({ activeTooltipIndex: 2 })).toBe(2);
        expect(getChartHoverIndex({ activeTooltipIndex: '3' })).toBe(3);
        expect(getChartHoverIndex({ activeTooltipIndex: 'nope' })).toBeNull();
        expect(getChartHoverIndex(null)).toBeNull();
    });

    it('summarizes known TLS failures while preserving raw detail text', () => {
        const rawError = 'write EPROTO: sslv3 alert handshake failure';

        expect(summarizeCheckError(rawError)).toBe('TLS handshake failed');
        expect(detailCheckError(rawError)).toBe(rawError);
        expect(summarizeCheckError(null)).toBe('Healthy response');
    });
});
