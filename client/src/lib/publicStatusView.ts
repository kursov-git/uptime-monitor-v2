import type { PublicStatusBucket, PublicStatusResponse } from '@uptime-monitor/shared';
import { getApiErrorMessage } from './apiErrors';

export type PublicBucket = PublicStatusResponse['history24h'][number];
export type PublicMonitor = PublicStatusResponse['monitors'][number];
export type PublicMonitorStatus = PublicMonitor['status'];

export interface AvailabilityPoint {
    time: string;
    availability: number | null;
    responseTimeMs: number | null;
    checks: number;
}

export interface PublicHeadline {
    tone: 'empty' | 'down' | 'unknown' | 'paused' | 'up';
    title: string;
    description: string;
}

export function formatTimestamp(value: string | null): string {
    if (!value) {
        return 'No checks yet';
    }

    return new Date(value).toLocaleString();
}

export function getStatusLabel(status: PublicMonitorStatus): string {
    if (status === 'up') return 'Operational';
    if (status === 'down') return 'Degraded';
    if (status === 'paused') return 'Paused';
    return 'Unknown';
}

export function formatHourLabel(value: string): string {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatHourRange(value: string): string {
    const start = new Date(value);
    const end = new Date(start.getTime() + 60 * 60 * 1000 - 1);
    return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatMinuteLabel(value: string): string {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateLabel(value: string): string {
    return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatAvailabilityValue(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function getIncidentTone(bucket: PublicBucket): 'operational' | 'degraded' | 'outage' | 'unknown' {
    if (bucket.totalChecks === 0 || bucket.uptimePercent === null) {
        return 'unknown';
    }

    if (bucket.uptimePercent === 100) {
        return 'operational';
    }

    if (bucket.uptimePercent === 0) {
        return 'outage';
    }

    return 'degraded';
}

export function getIncidentLabel(bucket: PublicBucket): string {
    const tone = getIncidentTone(bucket);
    if (tone === 'operational') return 'Operational';
    if (tone === 'outage') return 'Outage';
    if (tone === 'degraded') return 'Partial outage';
    return 'No data';
}

export function getIncidentSummary(buckets: PublicBucket[]): string {
    const impacted = buckets.filter((bucket) => {
        const tone = getIncidentTone(bucket);
        return tone === 'degraded' || tone === 'outage';
    }).length;

    const noData = buckets.filter((bucket) => getIncidentTone(bucket) === 'unknown').length;

    if (impacted === 0 && noData === 0) {
        return 'No incidents in 24h';
    }

    const parts: string[] = [];
    if (impacted > 0) {
        parts.push(`${impacted} impacted ${impacted === 1 ? 'hour' : 'hours'}`);
    }
    if (noData > 0) {
        parts.push(`${noData} ${noData === 1 ? 'hour has' : 'hours have'} no data`);
    }

    return parts.join(' · ');
}

export function getPublicHeadline(summary: PublicStatusResponse['summary'], monitorCount: number): PublicHeadline {
    if (monitorCount === 0) {
        return {
            tone: 'empty',
            title: 'No public monitors yet',
            description: 'Publish one or more monitors to expose a simple public-facing status view.',
        };
    }

    if (summary.down > 0) {
        return {
            tone: 'down',
            title: 'Some public services are down',
            description: `${summary.down} ${summary.down === 1 ? 'monitor is' : 'monitors are'} currently failing public checks.`,
        };
    }

    if (summary.unknown > 0) {
        return {
            tone: 'unknown',
            title: 'Public status is incomplete',
            description: `${summary.unknown} ${summary.unknown === 1 ? 'monitor has' : 'monitors have'} no recent public data yet.`,
        };
    }

    if (summary.paused > 0) {
        return {
            tone: 'paused',
            title: 'Public services are partly paused',
            description: `${summary.paused} ${summary.paused === 1 ? 'monitor is' : 'monitors are'} intentionally paused.`,
        };
    }

    return {
        tone: 'up',
        title: 'All public systems operational',
        description: 'Every published monitor is currently passing its expected checks.',
    };
}

export function getServiceGroupLabel(serviceName: string | null): string {
    return serviceName?.trim() || 'Standalone checks';
}

export function getServiceGroupStatus(monitors: PublicStatusResponse['monitors']): PublicMonitorStatus {
    if (monitors.some((monitor) => monitor.status === 'down')) return 'down';
    if (monitors.some((monitor) => monitor.status === 'unknown')) return 'unknown';
    if (monitors.some((monitor) => monitor.status === 'up')) return 'up';
    if (monitors.some((monitor) => monitor.status === 'paused')) return 'paused';
    return 'unknown';
}

export function getAverageUptime(monitors: PublicStatusResponse['monitors']): string {
    const values = monitors
        .map((monitor) => Number.parseFloat(monitor.uptimePercent24h))
        .filter((value) => Number.isFinite(value));

    if (values.length === 0) {
        return '—';
    }

    return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

export function buildAvailabilitySeries(buckets: PublicStatusBucket[]): AvailabilityPoint[] {
    return buckets.map((bucket) => ({
        time: formatHourLabel(bucket.timestamp),
        availability: bucket.uptimePercent,
        responseTimeMs: bucket.avgResponseTimeMs,
        checks: bucket.totalChecks,
    }));
}

export function getPublicStatusErrorMessage(error: unknown, fallback: string): string {
    return getApiErrorMessage(error, fallback);
}
