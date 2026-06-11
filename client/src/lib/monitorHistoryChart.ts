import type { CheckResult } from '../api';

export interface ChartPoint {
    index: number;
    time: string;
    timeLabel: string;
    timestampMs: number;
    responseTime: number;
    isUp: boolean;
    statusCode: number | null;
}

interface ChartHoverState {
    activeTooltipIndex?: number | string | null;
}

export function formatChartTick(timestampMs: number, spanMs: number): string {
    const date = new Date(timestampMs);

    if (spanMs >= 3 * 24 * 60 * 60 * 1000) {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    if (spanMs >= 24 * 60 * 60 * 1000) {
        return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getChartSpanMs(points: Array<{ timestampMs: number }>): number {
    return points.length > 1
        ? points[points.length - 1].timestampMs - points[0].timestampMs
        : 0;
}

export function buildChartPoints(results: CheckResult[]): ChartPoint[] {
    const spanMs = results.length > 1
        ? Math.abs(new Date(results[0].timestamp).getTime() - new Date(results[results.length - 1].timestamp).getTime())
        : 0;

    return [...results].reverse().map((result, index) => {
        const timestampMs = new Date(result.timestamp).getTime();

        return {
            index,
            time: formatChartTick(timestampMs, spanMs),
            timeLabel: new Date(result.timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }),
            timestampMs,
            responseTime: result.responseTimeMs,
            isUp: result.isUp,
            statusCode: result.statusCode,
        };
    });
}

export function formatChartPointsForSpan(points: ChartPoint[]): ChartPoint[] {
    const spanMs = getChartSpanMs(points);

    return points.map((point, index) => ({
        ...point,
        index,
        time: formatChartTick(point.timestampMs, spanMs),
    }));
}

export function downsampleChartData(points: ChartPoint[], maxPoints: number): ChartPoint[] {
    if (points.length <= maxPoints) {
        return points;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const middle = points.slice(1, -1);
    const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
    const bucketSize = Math.max(1, Math.ceil(middle.length / bucketCount));
    const sampled: ChartPoint[] = [first];

    for (let index = 0; index < middle.length; index += bucketSize) {
        const bucket = middle.slice(index, index + bucketSize);
        if (bucket.length === 0) continue;

        const firstFailure = bucket.find((point) => !point.isUp) ?? null;
        const peak = bucket.reduce((highest, point) => (
            point.responseTime >= highest.responseTime ? point : highest
        ), bucket[0]);

        const bucketPoints = [firstFailure, peak]
            .filter((point): point is ChartPoint => point !== null)
            .sort((a, b) => a.timestampMs - b.timestampMs)
            .filter((point, pointIndex, allPoints) => pointIndex === 0 || point !== allPoints[pointIndex - 1]);

        sampled.push(...bucketPoints);
    }

    sampled.push(last);

    return sampled
        .sort((a, b) => a.timestampMs - b.timestampMs)
        .filter((point, pointIndex, allPoints) => pointIndex === 0 || point !== allPoints[pointIndex - 1])
        .map((point, pointIndex) => ({ ...point, index: pointIndex }));
}

function getChartTickIntervalMs(spanMs: number): number {
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (spanMs <= 90 * minute) return 5 * minute;
    if (spanMs <= 3 * hour) return 15 * minute;
    if (spanMs <= 6 * hour) return 30 * minute;
    if (spanMs <= 24 * hour) return hour;
    if (spanMs <= 3 * day) return 6 * hour;
    if (spanMs <= 7 * day) return 12 * hour;
    return day;
}

export function buildChartTickIndexes(
    chartData: Array<{ index: number; timestampMs: number }>,
    spanMs: number,
): number[] {
    if (chartData.length <= 2) {
        return chartData.map((point) => point.index);
    }

    const tickIntervalMs = getChartTickIntervalMs(spanMs);
    const firstIndex = chartData[0].index;
    const lastIndex = chartData[chartData.length - 1].index;
    const ticks = new Set<number>([firstIndex, lastIndex]);
    let previousBucket: number | null = null;

    for (const point of chartData) {
        const bucket = Math.floor(point.timestampMs / tickIntervalMs);
        if (bucket !== previousBucket) {
            ticks.add(point.index);
            previousBucket = bucket;
        }
    }

    return Array.from(ticks).sort((a, b) => a - b);
}

export function getChartHoverIndex(state: unknown): number | null {
    const rawIndex = (state as ChartHoverState | null)?.activeTooltipIndex;
    if (rawIndex === null || rawIndex === undefined) return null;

    const normalized = typeof rawIndex === 'number' ? rawIndex : Number(rawIndex);
    if (!Number.isFinite(normalized)) return null;

    return normalized;
}

export function summarizeCheckError(error: string | null | undefined): string {
    if (!error) return 'Healthy response';

    const normalized = error.toLowerCase();
    if (normalized.includes('handshake failure')) return 'TLS handshake failed';
    if (normalized.includes('protocol version')) return 'TLS protocol mismatch';
    if (normalized.includes('certificate')) return 'Certificate validation failed';
    if (normalized.includes('eproto')) return 'TLS connection failed';

    return error;
}

export function detailCheckError(error: string | null | undefined): string {
    if (!error) return 'Healthy response';
    return error;
}
