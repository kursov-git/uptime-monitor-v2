interface MonitorAlertTarget {
    id: string;
    name: string;
    url: string;
}

interface MonitorAlertContext {
    executorLabel?: string;
    statusCode?: number | null;
    responseTimeMs?: number | null;
    appBaseUrl?: string | null;
}

interface AgentOfflineContext {
    appBaseUrl?: string | null;
    monitorsCount?: number;
}

interface AgentOnlineContext {
    appBaseUrl?: string | null;
    monitorsCount?: number;
    offlineDurationSec?: number;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeBaseUrl(value?: string | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\/+$/, '');
}

function buildLink(baseUrl: string | null, path: string, label: string): string | null {
    if (!baseUrl) return null;
    return `<a href="${escapeHtml(`${baseUrl}${path}`)}">${escapeHtml(label)}</a>`;
}

function appendOptionalLine(lines: string[], label: string, value: string | null | undefined): void {
    if (!value) return;
    lines.push(`${label}: ${escapeHtml(value)}`);
}

export function buildMonitorDownMessage(
    monitor: MonitorAlertTarget,
    error: string | null,
    consecutiveFailures: number,
    downTimeSec: number,
    context: MonitorAlertContext = {}
): string {
    const lines = [
        `🔴 <b>${escapeHtml(monitor.name)}</b> is DOWN`,
        `URL: ${escapeHtml(monitor.url)}`,
        `Check source: ${escapeHtml(context.executorLabel ?? 'builtin worker')}`,
        `Failures: ${consecutiveFailures}`,
        `Down for: ${Math.round(downTimeSec)}s`,
    ];

    if (context.statusCode !== null && context.statusCode !== undefined) {
        lines.push(`HTTP status: ${context.statusCode}`);
    }

    if (context.responseTimeMs !== null && context.responseTimeMs !== undefined) {
        lines.push(`Response time: ${context.responseTimeMs}ms`);
    }

    appendOptionalLine(lines, 'Error', error);

    const monitorLink = buildLink(normalizeBaseUrl(context.appBaseUrl), `/monitors/${monitor.id}/history`, 'Open monitor history');
    if (monitorLink) {
        lines.push(monitorLink);
    }

    return lines.join('\n');
}

export function buildMonitorRecoveryMessage(
    monitor: MonitorAlertTarget,
    consecutiveFailures: number,
    context: MonitorAlertContext = {}
): string {
    const lines = [
        `✅ <b>${escapeHtml(monitor.name)}</b> recovered`,
        `URL: ${escapeHtml(monitor.url)}`,
        `Check source: ${escapeHtml(context.executorLabel ?? 'builtin worker')}`,
        `Down checks: ${consecutiveFailures}`,
    ];

    if (context.statusCode !== null && context.statusCode !== undefined) {
        lines.push(`HTTP status: ${context.statusCode}`);
    }

    if (context.responseTimeMs !== null && context.responseTimeMs !== undefined) {
        lines.push(`Response time: ${context.responseTimeMs}ms`);
    }

    const monitorLink = buildLink(normalizeBaseUrl(context.appBaseUrl), `/monitors/${monitor.id}/history`, 'Open monitor history');
    if (monitorLink) {
        lines.push(monitorLink);
    }

    return lines.join('\n');
}

export function buildAgentOfflineMessage(
    agentName: string,
    lastSeen: Date,
    offlineAfterSec: number,
    context: AgentOfflineContext = {}
): string {
    const lines = [
        `🛰 <b>${escapeHtml(agentName)}</b> is OFFLINE`,
        `Last seen: ${escapeHtml(lastSeen.toISOString())}`,
        `Offline threshold: ${offlineAfterSec}s`,
    ];

    if (typeof context.monitorsCount === 'number') {
        lines.push(`Assigned monitors: ${context.monitorsCount}`);
    }

    const agentsLink = buildLink(normalizeBaseUrl(context.appBaseUrl), '/agents', 'Open agents');
    if (agentsLink) {
        lines.push(agentsLink);
    }

    return lines.join('\n');
}

export function buildAgentOnlineMessage(
    agentName: string,
    previousLastSeen: Date,
    context: AgentOnlineContext = {}
): string {
    const lines = [
        `🛰 <b>${escapeHtml(agentName)}</b> is ONLINE again`,
        `Recovered at: ${escapeHtml(new Date().toISOString())}`,
        `Last seen before recovery: ${escapeHtml(previousLastSeen.toISOString())}`,
    ];

    if (typeof context.offlineDurationSec === 'number') {
        lines.push(`Estimated offline time: ${Math.max(0, Math.round(context.offlineDurationSec))}s`);
    }

    if (typeof context.monitorsCount === 'number') {
        lines.push(`Assigned monitors: ${context.monitorsCount}`);
    }

    const agentsLink = buildLink(normalizeBaseUrl(context.appBaseUrl), '/agents', 'Open agents');
    if (agentsLink) {
        lines.push(agentsLink);
    }

    return lines.join('\n');
}

export function htmlToNotifierText(message: string): string {
    return message
        .replace(/<a\s+href="([^"]+)">([^<]+)<\/a>/g, '$2: $1')
        .replace(/<\/?b>/g, '**')
        .replace(/<br\s*\/?>/g, '\n');
}
