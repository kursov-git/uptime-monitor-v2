import type { CheckResult, Monitor } from '../api';

export type MonitorHistoryStatus = 'up' | 'down' | 'paused' | 'unknown' | 'flapping';

export const monitorHistoryStatusLabel: Record<MonitorHistoryStatus, string> = {
    up: '● Up',
    down: '● Down',
    paused: '⏸ Paused',
    unknown: '○ Unknown',
    flapping: '▲ Flapping',
};

export type MonitorHistorySslSummary = {
    label: string;
    expiresAt: string | null | undefined;
    issuer: string | null | undefined;
    subject: string | null | undefined;
    warning: boolean;
    note: string | null;
    rawError?: string | null;
};

export interface MonitorHistorySummary {
    uptimePercent: string;
    avgResponseTime: number;
    latestResult: CheckResult | null;
    sslSummary: MonitorHistorySslSummary | null;
    totalPages: number;
    currentPage: number;
    latestStatus: MonitorHistoryStatus;
    monitorTypeLabel: string;
    latestCheckedAt: string;
}

function getLatestSslResult(
    results: CheckResult[],
    chartResults: CheckResult[],
    monitor: Monitor,
): CheckResult | null {
    return [results[0], chartResults[0], monitor.lastCheck].find((result) =>
        result && (
            result.sslDaysRemaining !== null && result.sslDaysRemaining !== undefined
            || result.sslExpiresAt
            || result.sslIssuer
            || result.sslSubject
        )
    ) || null;
}

function buildSslSummary(
    monitor: Monitor,
    latestResult: CheckResult | null,
    latestSslResult: CheckResult | null,
): MonitorHistorySslSummary | null {
    if (!monitor.sslExpiryEnabled) {
        return null;
    }

    const sslThresholdDays = monitor.sslExpiryThresholdDays ?? 14;
    const latestSslFailure = latestResult?.error && /ssl|tls|certificate|eproto/i.test(latestResult.error)
        ? latestResult.error
        : null;

    if (latestSslResult?.sslDaysRemaining !== null && latestSslResult?.sslDaysRemaining !== undefined) {
        return {
            label: latestSslResult.sslDaysRemaining <= 0
                ? 'Expired'
                : `${latestSslResult.sslDaysRemaining} day${latestSslResult.sslDaysRemaining === 1 ? '' : 's'} left`,
            expiresAt: latestSslResult.sslExpiresAt,
            issuer: latestSslResult.sslIssuer,
            subject: latestSslResult.sslSubject,
            warning: latestSslResult.sslDaysRemaining <= sslThresholdDays,
            note: null,
        };
    }

    if (latestSslFailure) {
        return {
            label: 'TLS handshake failed',
            expiresAt: null,
            issuer: null,
            subject: null,
            warning: true,
            note: 'Certificate details were not collected because the HTTPS handshake failed.',
            rawError: latestSslFailure,
        };
    }

    return {
        label: 'Pending first HTTPS check',
        expiresAt: null,
        issuer: null,
        subject: null,
        warning: false,
        note: 'Certificate details will appear after the first successful HTTPS check.',
        rawError: null,
    };
}

function getLatestStatus(monitor: Monitor, latestResult: CheckResult | null): MonitorHistoryStatus {
    if (!monitor.isActive) {
        return 'paused';
    }

    if (monitor.flappingState?.isFlapping) {
        return 'flapping';
    }

    if (!latestResult) {
        return 'unknown';
    }

    return latestResult.isUp ? 'up' : 'down';
}

function getMonitorTypeLabel(monitor: Monitor): string {
    if (monitor.type === 'DNS') {
        return `DNS ${monitor.dnsRecordType}`;
    }

    if (monitor.type === 'TCP') {
        return 'TCP';
    }

    return monitor.method;
}

export function buildMonitorHistorySummary(input: {
    monitor: Monitor;
    results: CheckResult[];
    chartResults: CheckResult[];
    total: number;
    pageSize: number;
    offset: number;
    overallUptime: string;
    overallAvgRes: number;
}): MonitorHistorySummary {
    const { monitor, results, chartResults, total, pageSize, offset, overallUptime, overallAvgRes } = input;
    const latestResult = results[0] || chartResults[0] || monitor.lastCheck || null;
    const latestSslResult = getLatestSslResult(results, chartResults, monitor);

    return {
        uptimePercent: overallUptime,
        avgResponseTime: overallAvgRes,
        latestResult,
        sslSummary: buildSslSummary(monitor, latestResult, latestSslResult),
        totalPages: Math.ceil(total / pageSize),
        currentPage: Math.floor(offset / pageSize) + 1,
        latestStatus: getLatestStatus(monitor, latestResult),
        monitorTypeLabel: getMonitorTypeLabel(monitor),
        latestCheckedAt: latestResult ? new Date(latestResult.timestamp).toLocaleString() : 'No checks yet',
    };
}
