import { useEffect, useState } from 'react';
import { publicApi, type PublicStatusResponse } from '../api';
import type { PublicStatusBucket, PublicStatusDrilldownFailure, PublicStatusDrilldownResponse } from '@uptime-monitor/shared';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type PublicBucket = PublicStatusResponse['history24h'][number];

function formatTimestamp(value: string | null): string {
    if (!value) {
        return 'No checks yet';
    }

    return new Date(value).toLocaleString();
}

function getStatusLabel(status: PublicStatusResponse['monitors'][number]['status']): string {
    if (status === 'up') return 'Operational';
    if (status === 'down') return 'Degraded';
    if (status === 'paused') return 'Paused';
    return 'Unknown';
}

function formatHourLabel(value: string): string {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatHourRange(value: string): string {
    const start = new Date(value);
    const end = new Date(start.getTime() + 60 * 60 * 1000 - 1);
    return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatMinuteLabel(value: string): string {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(value: string): string {
    return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAvailabilityValue(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(1)}%`;
}

function getIncidentTone(bucket: PublicBucket): 'operational' | 'degraded' | 'outage' | 'unknown' {
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

function getIncidentLabel(bucket: PublicBucket): string {
    const tone = getIncidentTone(bucket);
    if (tone === 'operational') return 'Operational';
    if (tone === 'outage') return 'Outage';
    if (tone === 'degraded') return 'Partial outage';
    return 'No data';
}

function getIncidentSummary(buckets: PublicBucket[]): string {
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

function getPublicHeadline(summary: PublicStatusResponse['summary'], monitorCount: number) {
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

function IncidentStrip({
    buckets,
    compact = false,
    interactive = false,
    selectedTimestamp = null,
    onSelectBucket,
    labelPrefix = 'timeline',
}: {
    buckets: PublicBucket[];
    compact?: boolean;
    interactive?: boolean;
    selectedTimestamp?: string | null;
    onSelectBucket?: (bucket: PublicBucket) => void;
    labelPrefix?: string;
}) {
    const [hoveredTimestamp, setHoveredTimestamp] = useState<string | null>(null);
    const hoveredBucket = hoveredTimestamp
        ? buckets.find((bucket) => bucket.timestamp === hoveredTimestamp) ?? null
        : null;
    const hoveredIndex = hoveredBucket
        ? buckets.findIndex((bucket) => bucket.timestamp === hoveredBucket.timestamp)
        : -1;

    return (
        <div className={`public-incident-strip-shell ${compact ? 'compact' : ''}`}>
            {hoveredBucket && hoveredIndex >= 0 && (
                <div
                    className="public-incident-tooltip"
                    role="status"
                    aria-live="polite"
                    style={{ left: `calc(${((hoveredIndex + 0.5) / buckets.length) * 100}% )` }}
                >
                    <strong className={`public-incident-tooltip-status ${getIncidentTone(hoveredBucket)}`}>
                        {getIncidentLabel(hoveredBucket)}
                    </strong>
                    <span>{formatDateLabel(hoveredBucket.timestamp)}</span>
                    <span>{formatHourRange(hoveredBucket.timestamp)}</span>
                </div>
            )}
            <div className={`public-incident-strip ${compact ? 'compact' : ''}`} aria-label="Incident timeline for the last 24 hours">
            {buckets.map((bucket) => {
                const tone = getIncidentTone(bucket);
                const isSelected = selectedTimestamp === bucket.timestamp;

                if (interactive) {
                    return (
                        <button
                            key={bucket.timestamp}
                            type="button"
                            className={`public-incident-segment interactive ${tone} ${isSelected ? 'selected' : ''}`}
                            aria-label={`Drill down ${labelPrefix} ${formatHourRange(bucket.timestamp)}`}
                            onMouseEnter={() => setHoveredTimestamp(bucket.timestamp)}
                            onMouseLeave={() => setHoveredTimestamp(null)}
                            onFocus={() => setHoveredTimestamp(bucket.timestamp)}
                            onBlur={() => setHoveredTimestamp(null)}
                            onClick={() => onSelectBucket?.(bucket)}
                        />
                    );
                }

                return (
                    <div
                        key={bucket.timestamp}
                        className={`public-incident-segment ${tone} ${isSelected ? 'selected' : ''}`}
                        onMouseEnter={() => setHoveredTimestamp(bucket.timestamp)}
                        onMouseLeave={() => setHoveredTimestamp(null)}
                    />
                );
            })}
            </div>
        </div>
    );
}

export default function PublicStatusPage() {
    const [data, setData] = useState<PublicStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedDrilldown, setSelectedDrilldown] = useState<{ monitorId: string; timestamp: string } | null>(null);
    const [drilldownCache, setDrilldownCache] = useState<Record<string, PublicStatusDrilldownResponse>>({});
    const [drilldownLoading, setDrilldownLoading] = useState<string | null>(null);
    const [drilldownError, setDrilldownError] = useState('');

    useEffect(() => {
        const fetchStatus = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await publicApi.get<PublicStatusResponse>('/status');
                setData(res.data);
            } catch (err: any) {
                setError(err.response?.data?.error || err.message || 'Failed to load public status');
            } finally {
                setLoading(false);
            }
        };

        fetchStatus();
    }, []);

    const fetchDrilldown = async (monitorId: string, timestamp: string) => {
        const cacheKey = `${monitorId}:${timestamp}`;
        if (drilldownCache[cacheKey]) {
            setSelectedDrilldown({ monitorId, timestamp });
            setDrilldownError('');
            return;
        }

        setSelectedDrilldown({ monitorId, timestamp });
        setDrilldownLoading(cacheKey);
        setDrilldownError('');
        try {
            const res = await publicApi.get<PublicStatusDrilldownResponse>(`/status/${monitorId}/drilldown?start=${encodeURIComponent(timestamp)}`);
            setDrilldownCache((prev) => ({ ...prev, [cacheKey]: res.data }));
        } catch (err: any) {
            setDrilldownError(err.response?.data?.error || err.message || 'Failed to load drill-down');
        } finally {
            setDrilldownLoading(null);
        }
    };

    const summary = data?.summary ?? { up: 0, down: 0, paused: 0, unknown: 0 };
    const availabilitySeries = data?.history24h.map((bucket) => ({
        time: formatHourLabel(bucket.timestamp),
        availability: bucket.uptimePercent,
        responseTimeMs: bucket.avgResponseTimeMs,
        checks: bucket.totalChecks,
    })) ?? [];
    const latestAvailability = availabilitySeries[availabilitySeries.length - 1]?.availability ?? null;
    const headline = getPublicHeadline(summary, data?.monitorCount ?? 0);

    const OverviewTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.[0]) return null;

        const point = payload[0].payload;
        return (
            <div className="history-tooltip">
                <div className="history-tooltip-time">{point.time}</div>
                <div className="history-tooltip-value">
                    Availability {formatAvailabilityValue(point.availability)}
                </div>
                <div className="history-tooltip-time">
                    {point.responseTimeMs === null ? 'No checks' : `Avg response ${point.responseTimeMs}ms`}
                </div>
                <div className="history-tooltip-time">Checks {point.checks}</div>
            </div>
        );
    };

    return (
        <div className="public-status-page">
            <div className="public-status-shell">
                <div className="public-status-hero">
                    <div className="public-status-hero-card">
                        <div className="public-status-kicker">Public Status</div>
                        <h1>Ping Agent Status</h1>
                        <p>Live status for the monitors you decided to expose publicly, with a clean service-first view and hourly drill-down into failure windows.</p>
                        <div className="public-status-summary">
                            <div className="public-status-summary-stat">
                                <span>Published</span>
                                <strong>{data?.monitorCount ?? 0}</strong>
                            </div>
                            <div className="public-status-summary-stat">
                                <span>Operational</span>
                                <strong>{summary.up}</strong>
                            </div>
                            <div className="public-status-summary-stat">
                                <span>Down</span>
                                <strong>{summary.down}</strong>
                            </div>
                            <div className="public-status-summary-stat">
                                <span>Overall 24h</span>
                                <strong>{formatAvailabilityValue(latestAvailability)}</strong>
                            </div>
                        </div>
                    </div>
                    <div className="public-status-metric-card">
                        <div className="public-status-kicker">Current Status</div>
                        <div className="public-status-metric-label">Public summary</div>
                        <div className="public-status-metric-big">{formatAvailabilityValue(latestAvailability)}</div>
                        <strong className="public-status-metric-title">{headline.title}</strong>
                        <span className="public-status-metric-description">{headline.description}</span>
                        <div className="public-status-metric-footer">
                            <span className={`status-badge ${headline.tone === 'down' ? 'down' : headline.tone === 'up' ? 'up' : headline.tone === 'paused' ? 'paused' : 'flapping'}`}>
                                {headline.tone === 'down'
                                    ? 'Attention'
                                    : headline.tone === 'up'
                                        ? 'Operational'
                                        : headline.tone === 'paused'
                                            ? 'Paused'
                                            : 'Watch'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="public-status-meta">
                    <div className="public-status-meta-card">
                        <div>Updated: {data ? formatTimestamp(data.generatedAt) : '—'}</div>
                        <div>Published monitors: {data?.monitorCount ?? 0}</div>
                    </div>
                </div>

                {!loading && !error && data && data.monitors.length > 0 && (
                    <section className="public-status-overview-card">
                        <div className="public-status-overview-header">
                            <div>
                                <div className="public-status-kicker">24h Availability</div>
                                <h2>Public service health</h2>
                                <p>Hourly uptime across every published monitor, with incident coloring carried through into the service drill-downs below.</p>
                            </div>
                            <div className="public-status-overview-metric">
                                <span>Current</span>
                                <strong>{formatAvailabilityValue(latestAvailability)}</strong>
                            </div>
                        </div>
                        <div className="public-status-overview-graph">
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={availabilitySeries} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="publicStatusAvailability" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" stroke="rgba(99, 116, 138, 0.16)" vertical={false} />
                                <XAxis
                                    dataKey="time"
                                    stroke="#63748a"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={20}
                                />
                                <YAxis
                                    stroke="#63748a"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, 100]}
                                    tickFormatter={(value) => `${value}%`}
                                />
                                <Tooltip content={<OverviewTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="availability"
                                    stroke="#2563eb"
                                    strokeWidth={3}
                                    fill="url(#publicStatusAvailability)"
                                    connectNulls={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                        </div>
                        <div className="public-status-overview-timeline">
                            <div className="public-incident-panel-header">
                                <div>
                                    <strong>Incident Timeline</strong>
                                    <span>{getIncidentSummary(data.history24h)}</span>
                                </div>
                                <div className="public-incident-axis-labels">
                                    <span>24h ago</span>
                                    <span>Now</span>
                                </div>
                            </div>
                            <IncidentStrip buckets={data.history24h} />
                            <div className="public-incident-legend">
                                <span><i className="operational" /> Operational</span>
                                <span><i className="degraded" /> Partial outage</span>
                                <span><i className="outage" /> Outage</span>
                                <span><i className="unknown" /> No data</span>
                            </div>
                        </div>
                    </section>
                )}

                {loading ? (
                    <div className="card"><div className="empty-state"><h3>Loading public status…</h3></div></div>
                ) : error ? (
                    <div className="card"><div className="error-message">{error}</div></div>
                ) : !data || data.monitors.length === 0 ? (
                    <div className="card">
                        <div className="empty-state">
                            <h3>No public monitors yet</h3>
                            <p>Use the monitor visibility toggle in the dashboard to publish a small curated status set.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="public-status-section-header">
                            <div>
                                <div className="public-status-kicker">Services</div>
                                <h2>Current service status</h2>
                                <p>Each service stays clickable down to the exact failure window without leaving the public page.</p>
                            </div>
                            <div className="public-status-section-meta">
                                <span>{data.monitorCount} published {data.monitorCount === 1 ? 'monitor' : 'monitors'}</span>
                            </div>
                        </div>
                        <div className="public-status-grid">
                            {data.monitors.map((monitor) => (
                                <section className={`public-status-service-card ${monitor.status}`} key={monitor.id}>
                                <div className="public-status-service-top">
                                    <div className="public-status-card-title">
                                        <h3>{monitor.name}</h3>
                                        <div className="monitor-url">{monitor.url}</div>
                                    </div>
                                    <div className="public-status-service-status">
                                        <span className={`status-badge ${monitor.status}`}>
                                            {getStatusLabel(monitor.status)}
                                        </span>
                                        <div className="public-service-availability">
                                            <span>24h Uptime</span>
                                            <strong>{monitor.uptimePercent24h}%</strong>
                                        </div>
                                    </div>
                                </div>
                                <div className="public-status-stats public-status-stats-inline">
                                    <div>
                                        <span>Method</span>
                                        <strong>{monitor.method}</strong>
                                    </div>
                                    <div>
                                        <span>Latest response</span>
                                        <strong>{monitor.lastCheck ? `${monitor.lastCheck.responseTimeMs}ms` : '—'}</strong>
                                    </div>
                                    <div>
                                        <span>Last check</span>
                                        <strong>{formatTimestamp(monitor.lastCheck?.timestamp ?? null)}</strong>
                                    </div>
                                </div>
                                <div className="public-status-timeline-header">
                                    <span>Incident timeline</span>
                                    <strong>{getIncidentSummary(monitor.history24h)}</strong>
                                </div>
                                <IncidentStrip
                                    buckets={monitor.history24h}
                                    compact
                                    interactive
                                    selectedTimestamp={selectedDrilldown?.monitorId === monitor.id ? selectedDrilldown.timestamp : null}
                                    labelPrefix={`${monitor.name} hour`}
                                    onSelectBucket={(bucket) => {
                                        const isSameSelection = selectedDrilldown?.monitorId === monitor.id
                                            && selectedDrilldown.timestamp === bucket.timestamp;
                                        if (isSameSelection) {
                                            setSelectedDrilldown(null);
                                            setDrilldownError('');
                                            return;
                                        }

                                        fetchDrilldown(monitor.id, bucket.timestamp);
                                    }}
                                />
                                <div className="help-text" style={{ marginTop: 8 }}>
                                    Click any hour on the strip or the chart to inspect the exact failure window in 5-minute detail.
                                </div>
                                <div className="public-status-sparkline clickable">
                                    <div className="public-status-sparkline-chart">
                                        <ResponsiveContainer width="100%" height={72}>
                                            <AreaChart
                                                data={monitor.history24h.map((bucket) => ({
                                                    timestamp: bucket.timestamp,
                                                    time: formatHourLabel(bucket.timestamp),
                                                    availability: bucket.uptimePercent,
                                                }))}
                                                margin={{ top: 6, right: 0, left: 0, bottom: 0 }}
                                            >
                                                <defs>
                                                    <linearGradient id={`monitorAvailability-${monitor.id}`} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor={monitor.status === 'down' ? '#ef4444' : '#2563eb'} stopOpacity={0.28} />
                                                        <stop offset="100%" stopColor={monitor.status === 'down' ? '#ef4444' : '#2563eb'} stopOpacity={0.03} />
                                                    </linearGradient>
                                                </defs>
                                                <Area
                                                    type="monotone"
                                                    dataKey="availability"
                                                    stroke={monitor.status === 'down' ? '#dc2626' : '#2563eb'}
                                                    strokeWidth={2}
                                                    fill={`url(#monitorAvailability-${monitor.id})`}
                                                    connectNulls={false}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="public-status-sparkline-overlay">
                                        {monitor.history24h.map((bucket) => {
                                            const isSelected = selectedDrilldown?.monitorId === monitor.id
                                                && selectedDrilldown.timestamp === bucket.timestamp;

                                            return (
                                                <button
                                                    key={bucket.timestamp}
                                                    type="button"
                                                    className={`public-status-sparkline-hitbox ${isSelected ? 'selected' : ''}`}
                                                    aria-label={`Chart drill down ${monitor.name} ${formatHourRange(bucket.timestamp)}`}
                                                    title={`Chart drill-down · ${formatTimestamp(bucket.timestamp)} · ${getIncidentLabel(bucket)}`}
                                                    onClick={() => {
                                                        const isSameSelection = selectedDrilldown?.monitorId === monitor.id
                                                            && selectedDrilldown.timestamp === bucket.timestamp;
                                                        if (isSameSelection) {
                                                            setSelectedDrilldown(null);
                                                            setDrilldownError('');
                                                            return;
                                                        }

                                                        fetchDrilldown(monitor.id, bucket.timestamp);
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                                {selectedDrilldown?.monitorId === monitor.id && (
                                    <div className="public-drilldown-card">
                                        <div className="public-status-timeline-header">
                                            <span>Selected hour</span>
                                            <strong>{formatHourRange(selectedDrilldown.timestamp)}</strong>
                                        </div>
                                        {drilldownError ? (
                                            <div className="error-message" style={{ marginBottom: 0 }}>{drilldownError}</div>
                                        ) : drilldownLoading === `${monitor.id}:${selectedDrilldown.timestamp}` ? (
                                            <div className="empty-state" style={{ padding: '16px 0' }}>
                                                <h3>Loading drill-down…</h3>
                                            </div>
                                        ) : (() => {
                                            const drilldown = drilldownCache[`${monitor.id}:${selectedDrilldown.timestamp}`];
                                            if (!drilldown) {
                                                return null;
                                            }

                                            const detailedSeries = drilldown.history.map((bucket: PublicStatusBucket) => ({
                                                time: formatMinuteLabel(bucket.timestamp),
                                                availability: bucket.uptimePercent,
                                                responseTimeMs: bucket.avgResponseTimeMs,
                                                checks: bucket.totalChecks,
                                            }));

                                            return (
                                                <>
                                                    <div className="public-drilldown-summary">
                                                        <div>
                                                            <span>Checks</span>
                                                            <strong>{drilldown.totalChecks}</strong>
                                                        </div>
                                                        <div>
                                                            <span>Availability</span>
                                                            <strong>{formatAvailabilityValue(drilldown.uptimePercent)}</strong>
                                                        </div>
                                                        <div>
                                                            <span>Failed checks</span>
                                                            <strong>{drilldown.failures.length}</strong>
                                                        </div>
                                                    </div>
                                                    <div className="public-status-sparkline public-status-minute-chart" style={{ marginTop: 10 }}>
                                                        <ResponsiveContainer width="100%" height={120}>
                                                            <AreaChart data={detailedSeries} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                                                                <defs>
                                                                    <linearGradient id={`drilldownAvailability-${monitor.id}`} x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.42} />
                                                                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.04} />
                                                                    </linearGradient>
                                                                </defs>
                                                                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                                                                <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} minTickGap={12} />
                                                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                                                                <Tooltip content={<OverviewTooltip />} />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey="availability"
                                                                    stroke="#f59e0b"
                                                                    strokeWidth={2}
                                                                    fill={`url(#drilldownAvailability-${monitor.id})`}
                                                                    connectNulls={false}
                                                                />
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                    {drilldown.failures.length > 0 ? (
                                                        <div className="public-drilldown-failures">
                                                            <strong>Failure timestamps</strong>
                                                            <div className="public-drilldown-failure-list">
                                                                {drilldown.failures.map((failure: PublicStatusDrilldownFailure) => (
                                                                    <div key={failure.timestamp} className="public-drilldown-failure-item">
                                                                        <div className="public-drilldown-failure-main">
                                                                            <strong>{formatTimestamp(failure.timestamp)}</strong>
                                                                            <span>
                                                                                {failure.statusCode ? `HTTP ${failure.statusCode}` : 'No status'}
                                                                                {failure.error ? ` · ${failure.error}` : ''}
                                                                            </span>
                                                                        </div>
                                                                        <div className="public-drilldown-failure-metrics">
                                                                            <span>Response</span>
                                                                            <strong>{failure.responseTimeMs}ms</strong>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="help-text" style={{ marginTop: 10 }}>
                                                            No failed checks inside this hour.
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                                {monitor.lastCheck?.error && (
                                    <div className="history-error" style={{ marginTop: 12 }}>
                                        {monitor.lastCheck.error}
                                    </div>
                                )}
                                </section>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
