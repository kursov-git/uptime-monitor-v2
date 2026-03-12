import { useEffect, useState } from 'react';
import { publicApi, type PublicStatusResponse } from '../api';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

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

function formatAvailabilityValue(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(1)}%`;
}

export default function PublicStatusPage() {
    const [data, setData] = useState<PublicStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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

    const summary = data?.summary ?? { up: 0, down: 0, paused: 0, unknown: 0 };
    const availabilitySeries = data?.history24h.map((bucket) => ({
        time: formatHourLabel(bucket.timestamp),
        availability: bucket.uptimePercent,
        responseTimeMs: bucket.avgResponseTimeMs,
        checks: bucket.totalChecks,
    })) ?? [];
    const latestAvailability = availabilitySeries[availabilitySeries.length - 1]?.availability ?? null;

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
                    <div>
                        <div className="public-status-kicker">Public Status</div>
                        <h1>Ping Agent Status</h1>
                        <p>Live status for the monitors you decided to expose publicly.</p>
                    </div>
                    <div className="public-status-meta">
                        <div>Updated: {data ? formatTimestamp(data.generatedAt) : '—'}</div>
                        <div>Published monitors: {data?.monitorCount ?? 0}</div>
                    </div>
                </div>

                <div className="public-status-summary">
                    <div className="public-status-pill up">Up {summary.up}</div>
                    <div className="public-status-pill down">Down {summary.down}</div>
                    <div className="public-status-pill paused">Paused {summary.paused}</div>
                    <div className="public-status-pill unknown">Unknown {summary.unknown}</div>
                </div>

                {!loading && !error && data && data.monitors.length > 0 && (
                    <div className="card public-status-chart-card">
                        <div className="public-status-chart-header">
                            <div>
                                <div className="public-status-kicker">24h Availability</div>
                                <h2>Public service health</h2>
                            </div>
                            <div className="public-status-chart-meta">
                                <div>Current</div>
                                <strong>{formatAvailabilityValue(latestAvailability)}</strong>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={availabilitySeries} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="publicStatusAvailability" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.16)" vertical={false} />
                                <XAxis
                                    dataKey="time"
                                    stroke="#94a3b8"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={20}
                                />
                                <YAxis
                                    stroke="#94a3b8"
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
                                    stroke="#22c55e"
                                    strokeWidth={3}
                                    fill="url(#publicStatusAvailability)"
                                    connectNulls={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {loading ? (
                    <div className="card"><div className="empty-state"><h3>Loading public status…</h3></div></div>
                ) : error ? (
                    <div className="card"><div className="error-message">{error}</div></div>
                ) : !data || data.monitors.length === 0 ? (
                    <div className="card"><div className="empty-state"><h3>No public monitors yet</h3></div></div>
                ) : (
                    <div className="public-status-grid">
                        {data.monitors.map((monitor) => (
                            <div className="card public-status-card" key={monitor.id}>
                                <div className="public-status-card-header">
                                    <div>
                                        <h3>{monitor.name}</h3>
                                        <div className="monitor-url">{monitor.url}</div>
                                    </div>
                                    <span className={`status-badge ${monitor.status}`}>
                                        {getStatusLabel(monitor.status)}
                                    </span>
                                </div>
                                <div className="public-status-sparkline">
                                    <ResponsiveContainer width="100%" height={72}>
                                        <AreaChart
                                            data={monitor.history24h.map((bucket) => ({
                                                time: formatHourLabel(bucket.timestamp),
                                                availability: bucket.uptimePercent,
                                            }))}
                                            margin={{ top: 6, right: 0, left: 0, bottom: 0 }}
                                        >
                                            <defs>
                                                <linearGradient id={`monitorAvailability-${monitor.id}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={monitor.status === 'down' ? '#ef4444' : '#3b82f6'} stopOpacity={0.4} />
                                                    <stop offset="100%" stopColor={monitor.status === 'down' ? '#ef4444' : '#3b82f6'} stopOpacity={0.04} />
                                                </linearGradient>
                                            </defs>
                                            <Area
                                                type="monotone"
                                                dataKey="availability"
                                                stroke={monitor.status === 'down' ? '#ef4444' : '#3b82f6'}
                                                strokeWidth={2}
                                                fill={`url(#monitorAvailability-${monitor.id})`}
                                                connectNulls={false}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="public-status-stats">
                                    <div>
                                        <span>Method</span>
                                        <strong>{monitor.method}</strong>
                                    </div>
                                    <div>
                                        <span>24h Uptime</span>
                                        <strong>{monitor.uptimePercent24h}%</strong>
                                    </div>
                                    <div>
                                        <span>Last Check</span>
                                        <strong>{formatTimestamp(monitor.lastCheck?.timestamp ?? null)}</strong>
                                    </div>
                                    <div>
                                        <span>Response</span>
                                        <strong>{monitor.lastCheck ? `${monitor.lastCheck.responseTimeMs}ms` : '—'}</strong>
                                    </div>
                                </div>
                                {monitor.lastCheck?.error && (
                                    <div className="history-error" style={{ marginTop: 12 }}>
                                        {monitor.lastCheck.error}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
