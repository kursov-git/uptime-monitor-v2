import { useState, useEffect, useCallback } from 'react';
import { monitorsApi, apiClient, CheckResult, Monitor } from '../api';
import type { NotificationHistoryEntry } from '@uptime-monitor/shared';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useParams, useNavigate } from 'react-router-dom';
import TimeRangeFilter, { TimeRangeValue, computeAbsoluteRange } from '../components/TimeRangeFilter';
import { useAuth } from '../contexts/AuthContext';

interface StatsResponse {
    results: CheckResult[];
    total: number;
    limit: number;
    offset: number;
    overallUptimePercent?: string;
    overallAvgResponseMs?: number;
}

const PAGE_SIZE = 50;

function summarizeCheckError(error: string | null | undefined): string {
    if (!error) return 'Healthy response';

    const normalized = error.toLowerCase();
    if (normalized.includes('handshake failure')) return 'TLS handshake failed';
    if (normalized.includes('protocol version')) return 'TLS protocol mismatch';
    if (normalized.includes('certificate')) return 'Certificate validation failed';
    if (normalized.includes('eproto')) return 'TLS connection failed';

    return error;
}

function detailCheckError(error: string | null | undefined): string {
    if (!error) return 'Healthy response';
    return error;
}

export default function MonitorHistory({ onBack }: { onBack: () => void }) {
    const { isAdmin } = useAuth();
    const { id: monitorId } = useParams();
    const navigate = useNavigate();
    const [monitor, setMonitor] = useState<Monitor | null>(null);
    const [results, setResults] = useState<CheckResult[]>([]);
    const [chartResults, setChartResults] = useState<CheckResult[]>([]);
    const [overallUptime, setOverallUptime] = useState<string>('—');
    const [overallAvgRes, setOverallAvgRes] = useState<number>(0);
    const [recentNotifications, setRecentNotifications] = useState<NotificationHistoryEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRangeValue>('now-1h');

    const fetchHistory = useCallback(async () => {
        if (!monitorId) return;
        try {
            setLoading(true);
            const { from, to } = computeAbsoluteRange(timeRange);
            let statsUrl = `/${monitorId}/stats?limit=${PAGE_SIZE}&offset=${offset}`;
            if (from) statsUrl += `&from=${from}`;
            if (to) statsUrl += `&to=${to}`;

            let chartUrl = `/${monitorId}/stats?limit=1000&offset=0`;
            if (from) chartUrl += `&from=${from}`;
            if (to) chartUrl += `&to=${to}`;

            // Fetch monitor details as well since it's not passed as prop
            const [monitorRes, statsRes, chartRes] = await Promise.all([
                monitorsApi.get<Monitor>(`/${monitorId}`),
                monitorsApi.get<StatsResponse>(statsUrl),
                monitorsApi.get<StatsResponse>(chartUrl),
            ]);
            setMonitor(monitorRes.data);
            setResults(statsRes.data.results);
            setTotal(statsRes.data.total);
            setOverallUptime(statsRes.data.overallUptimePercent || '—');
            setOverallAvgRes(statsRes.data.overallAvgResponseMs || 0);
            setChartResults(chartRes.data.results);
            if (isAdmin) {
                try {
                    const notifRes = await apiClient.get(`/notifications/history?limit=5&monitorId=${monitorId}`);
                    setRecentNotifications(notifRes.data.history);
                } catch (notifErr) {
                    console.error('Failed to fetch notification history:', notifErr);
                    setRecentNotifications([]);
                }
            } else {
                setRecentNotifications([]);
            }
        } catch (err) {
            console.error('Failed to fetch history:', err);
        } finally {
            setLoading(false);
        }
    }, [isAdmin, monitorId, offset, timeRange]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const handleTimeRangeChange = (newRange: TimeRangeValue) => {
        setTimeRange(newRange);
        setOffset(0);
    };

    if (!monitor) {
        return (
            <div className="app-container page-container">
                <div className="dashboard-toolbar">
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← Back
                    </button>
                </div>
                {loading ? <div className="empty-state" style={{ padding: '20px' }}>Loading...</div> : <div className="empty-state">Monitor not found</div>}
            </div>
        );
    }

    const chartData = [...chartResults].reverse().map((r) => ({
        time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        responseTime: r.responseTimeMs,
        isUp: r.isUp,
    }));

    const uptimePercent = overallUptime;
    const avgResponseTime = overallAvgRes;
    const latestResult = results[0] || chartResults[0] || monitor.lastCheck || null;
    const latestSslResult = [results[0], chartResults[0], monitor.lastCheck].find((result) =>
        result && (
            result.sslDaysRemaining !== null && result.sslDaysRemaining !== undefined
            || result.sslExpiresAt
            || result.sslIssuer
            || result.sslSubject
        )
    ) || null;
    const sslThresholdDays = monitor.sslExpiryThresholdDays ?? 14;
    const latestSslFailure = latestResult?.error && /ssl|tls|certificate|eproto/i.test(latestResult.error)
        ? latestResult.error
        : null;
    const sslSummary = monitor.sslExpiryEnabled
        ? latestSslResult?.sslDaysRemaining !== null && latestSslResult?.sslDaysRemaining !== undefined
            ? {
                label: latestSslResult.sslDaysRemaining <= 0
                    ? 'Expired'
                    : `${latestSslResult.sslDaysRemaining} day${latestSslResult.sslDaysRemaining === 1 ? '' : 's'} left`,
                expiresAt: latestSslResult.sslExpiresAt,
                issuer: latestSslResult.sslIssuer,
                subject: latestSslResult.sslSubject,
                warning: latestSslResult.sslDaysRemaining <= sslThresholdDays,
                note: null,
            }
            : latestSslFailure
                ? {
                    label: 'TLS handshake failed',
                    expiresAt: null,
                    issuer: null,
                    subject: null,
                    warning: true,
                    note: 'Certificate details were not collected because the HTTPS handshake failed.',
                    rawError: latestSslFailure,
                }
                : {
                    label: 'Pending first HTTPS check',
                    expiresAt: null,
                    issuer: null,
                    subject: null,
                    warning: false,
                    note: 'Certificate details will appear after the first successful HTTPS check.',
                    rawError: null,
                }
        : null;

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
    const latestStatus = !monitor.isActive
        ? 'paused'
        : monitor.flappingState?.isFlapping
            ? 'flapping'
            : latestResult
                ? (latestResult.isUp ? 'up' : 'down')
                : 'unknown';
    const latestStatusLabel: Record<string, string> = {
        up: '● Up',
        down: '● Down',
        paused: '⏸ Paused',
        unknown: '○ Unknown',
        flapping: '▲ Flapping',
    };
    const monitorTypeLabel = monitor.type === 'DNS'
        ? `DNS ${monitor.dnsRecordType}`
        : monitor.type === 'TCP'
            ? 'TCP'
            : monitor.method;
    const latestCheckedAt = latestResult
        ? new Date(latestResult.timestamp).toLocaleString()
        : 'No checks yet';

    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.[0]) return null;
        const data = payload[0].payload;
        return (
            <div className="history-tooltip">
                <div className="history-tooltip-time">{data.time}</div>
                <div className={`history-tooltip-status ${data.isUp ? 'up' : 'down'}`}>
                    {data.isUp ? '● UP' : '● DOWN'}
                </div>
                <div className="history-tooltip-value">{data.responseTime}ms</div>
            </div>
        );
    };

    return (
        <div className="app-container page-container history-page">
            <div className="dashboard-toolbar">
                <div className="dashboard-toolbar-copy">
                    <h2>Monitor History</h2>
                    <p>Detailed response history, validation output, and recent notification delivery for a single monitor.</p>
                </div>
                <div className="history-toolbar-actions">
                    <TimeRangeFilter value={timeRange} onChange={handleTimeRangeChange} />
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← Back
                    </button>
                </div>
            </div>

            <div className="history-hero">
                <div className="history-hero-card">
                    <div className="app-modal-kicker">Monitor Detail</div>
                    <h1>{monitor.name}</h1>
                    <div className="history-subtitle">{monitor.url}</div>
                    <div className="monitor-meta-pills">
                        {monitor.serviceName && (
                            <div className="monitor-meta-pill service">
                                <span>Service</span>
                                <strong>{monitor.serviceName}</strong>
                            </div>
                        )}
                        <div className="monitor-meta-pill">
                            <span>Type</span>
                            <strong>{monitorTypeLabel}</strong>
                        </div>
                        <div className="monitor-meta-pill">
                            <span>Executor</span>
                            <strong>{monitor.agentName || 'Builtin Worker'}</strong>
                        </div>
                        {monitor.isPublic && (
                            <div className="monitor-meta-pill success">
                                <span>Visibility</span>
                                <strong>Public status</strong>
                            </div>
                        )}
                    </div>

                    <div className="history-summary-wrap">
                        <div className="history-summary-title">Summary</div>
                        <div className="dashboard-summary-cards history-metric-grid">
                            <div className="dashboard-summary-card">
                                <span>Total checks</span>
                                <strong>{total}</strong>
                            </div>
                            <div className="dashboard-summary-card">
                                <span>Uptime</span>
                                <strong className="history-summary-value uptime">{uptimePercent}%</strong>
                            </div>
                            <div className="dashboard-summary-card">
                                <span>Avg response</span>
                                <strong>{avgResponseTime}ms</strong>
                            </div>
                            <div className="dashboard-summary-card">
                                <span>Interval</span>
                                <strong>{monitor.intervalSeconds}s</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="history-status-card">
                    <div className="history-status-panel">
                        <div className="history-status-label">Current status</div>
                        <span className={`status-badge ${latestStatus}`}>{latestStatusLabel[latestStatus]}</span>
                    </div>
                    <div className="history-status-meta">
                        <div>
                            <span>Checked</span>
                            <strong>{latestCheckedAt}</strong>
                        </div>
                        <div>
                            <span>Response</span>
                            <strong>{latestResult ? `${latestResult.responseTimeMs}ms` : '—'}</strong>
                        </div>
                        <div>
                            <span>HTTP code</span>
                            <strong>{latestResult?.statusCode ?? '—'}</strong>
                        </div>
                    </div>
                    {sslSummary && (
                        <div className={`history-ssl-card ${sslSummary.warning ? 'warning' : 'ok'}`}>
                            <div className="history-ssl-header">
                                <div className="history-status-label">SSL</div>
                                <strong>{sslSummary.label}</strong>
                            </div>
                            <div className="history-ssl-meta">
                                {sslSummary.expiresAt && (
                                    <div>
                                        <span>Expires</span>
                                        <strong>{new Date(sslSummary.expiresAt).toLocaleString()}</strong>
                                    </div>
                                )}
                                {sslSummary.issuer && (
                                    <div>
                                        <span>Issuer</span>
                                        <strong>{sslSummary.issuer}</strong>
                                    </div>
                                )}
                                {sslSummary.subject && (
                                    <div>
                                        <span>Subject</span>
                                        <strong>{sslSummary.subject}</strong>
                                    </div>
                                )}
                                {sslSummary.note && (
                                    <div className="history-ssl-note" title={sslSummary.rawError || sslSummary.note}>
                                        <span>SSL status</span>
                                        <strong>{sslSummary.note}</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="agents-section-card history-section-card">
                <div className="section-header">
                    <h2>Response Time</h2>
                </div>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="responseGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#d5e1ea" />
                            <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                            <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}ms`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="responseTime"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#responseGrad)"
                                dot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    if (!payload.isUp) {
                                        return (
                                            <circle
                                                key={`dot-${cx}-${cy}`}
                                                cx={cx}
                                                cy={cy}
                                                r={4}
                                                fill="#ef4444"
                                                stroke="#ef4444"
                                            />
                                        );
                                    }
                                    return <circle key={`dot-${cx}-${cy}`} r={0} />;
                                }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                        <p>No check results yet</p>
                    </div>
                )}
            </div>

            <div className="agents-section-card history-section-card">
                <div className="section-header">
                    <h2>Check Results</h2>
                </div>
                {loading ? (
                    <div className="empty-state" style={{ padding: '20px' }}>Loading...</div>
                ) : results.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px' }}>
                        <p>No results found</p>
                    </div>
                ) : (
                    <>
                        <div className="history-results-list history-ledger">
                            <div className="history-ledger-head" aria-hidden="true">
                                <span>Timestamp</span>
                                <span>Status</span>
                                <span>Response</span>
                                <span>Code</span>
                                <span>Result</span>
                                <span>Detail</span>
                            </div>
                            {results.map((r) => (
                                <article key={r.id} className="history-ledger-row">
                                    <div className="history-ledger-time">
                                        {new Date(r.timestamp).toLocaleString()}
                                    </div>
                                    <div className="history-ledger-status">
                                        <span className={`status-badge ${r.isUp ? 'up' : 'down'}`}>
                                            {r.isUp ? '● UP' : '● DOWN'}
                                        </span>
                                    </div>
                                    <div className="history-ledger-value">
                                        {r.responseTimeMs}ms
                                    </div>
                                    <div className="history-ledger-value">
                                        {r.statusCode ?? '—'}
                                    </div>
                                    <div className="history-ledger-summary" title={r.error || 'Healthy response'}>
                                        {summarizeCheckError(r.error)}
                                    </div>
                                    <div className="history-ledger-detail" title={detailCheckError(r.error)}>
                                        {detailCheckError(r.error)}
                                    </div>
                                </article>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="pagination">
                                <button
                                    className="btn btn-sm btn-secondary"
                                    disabled={offset === 0}
                                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                                >
                                    ← Prev
                                </button>
                                <span className="pagination-info">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    disabled={offset + PAGE_SIZE >= total}
                                    onClick={() => setOffset(offset + PAGE_SIZE)}
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {isAdmin && (
                <div className="agents-section-card history-section-card">
                    <div className="section-header" style={{ marginBottom: 16 }}>
                        <h2>Recent Notifications</h2>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/settings/history?monitorId=${monitorId}`)}>
                            View Full Notification History →
                        </button>
                    </div>

                    {loading ? (
                        <div className="empty-state" style={{ padding: '20px' }}>Loading...</div>
                    ) : recentNotifications.length === 0 ? (
                        <div className="empty-state" style={{ padding: '20px' }}>
                            <p>No notifications sent recently</p>
                        </div>
                    ) : (
                        <div className="history-results-list">
                            {recentNotifications.map((n) => (
                                <article key={n.id} className="history-row-card notification">
                                    <div className="history-row-main">
                                        <div className="history-timestamp">
                                            {new Date(n.timestamp).toLocaleString()}
                                        </div>
                                        <div className="history-row-statusline">
                                            <span className={`history-channel-badge ${n.channel === 'TELEGRAM' ? 'telegram' : 'zulip'}`}>
                                                {n.channel}
                                            </span>
                                            <span className={`status-badge ${n.status === 'SUCCESS' ? 'up' : 'down'}`}>
                                                {n.status === 'SUCCESS' ? '✓ SUCCESS' : '✕ FAILED'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="history-row-metrics notification">
                                        <div className="history-row-metric wide">
                                            <span>Delivery</span>
                                            <strong>{n.error || 'Delivered successfully'}</strong>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
