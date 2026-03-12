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
                <div className="app-header">
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← Back
                    </button>
                </div>
                {loading ? <div className="empty-state" style={{ padding: '20px' }}>Loading...</div> : <div className="empty-state">Monitor not found</div>}
            </div>
        );
    }

    // Chart data — reverse so oldest is on left
    const chartData = [...chartResults].reverse().map((r) => ({
        time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        responseTime: r.responseTimeMs,
        isUp: r.isUp,
    }));

    const uptimePercent = overallUptime;
    const avgResponseTime = overallAvgRes;

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

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
        <div className="app-container page-container">
            {/* Header */}
            <div className="app-header">
                <div>
                    <h1>📊 {monitor.name}</h1>
                    <div className="history-subtitle">{monitor.url}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <TimeRangeFilter value={timeRange} onChange={handleTimeRangeChange} />
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← Back
                    </button>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="history-summary">
                <div className="history-summary-card">
                    <div className="history-summary-label">Total Checks</div>
                    <div className="history-summary-value">{total}</div>
                </div>
                <div className="history-summary-card">
                    <div className="history-summary-label">Uptime</div>
                    <div className="history-summary-value uptime">{uptimePercent}%</div>
                </div>
                <div className="history-summary-card">
                    <div className="history-summary-label">Avg Response</div>
                    <div className="history-summary-value">{avgResponseTime}ms</div>
                </div>
                <div className="history-summary-card">
                    <div className="history-summary-label">Interval</div>
                    <div className="history-summary-value">{monitor.intervalSeconds}s</div>
                </div>
            </div>

            {/* Response Time Chart */}
            <div className="card history-chart-card">
                <h3>Response Time</h3>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="responseGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                                dataKey="time"
                                stroke="#64748b"
                                fontSize={11}
                                tickLine={false}
                            />
                            <YAxis
                                stroke="#64748b"
                                fontSize={11}
                                tickLine={false}
                                tickFormatter={(v) => `${v}ms`}
                            />
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

            {/* Results Table */}
            <div className="card" style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 16 }}>Check Results</h3>
                {loading ? (
                    <div className="empty-state" style={{ padding: '20px' }}>Loading...</div>
                ) : results.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px' }}>
                        <p>No results found</p>
                    </div>
                ) : (
                    <>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Status</th>
                                        <th>Response</th>
                                        <th>HTTP Code</th>
                                        <th>Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r) => (
                                        <tr key={r.id}>
                                            <td className="history-timestamp">
                                                {new Date(r.timestamp).toLocaleString()}
                                            </td>
                                            <td>
                                                <span className={`status-badge ${r.isUp ? 'up' : 'down'}`}>
                                                    {r.isUp ? '● UP' : '● DOWN'}
                                                </span>
                                            </td>
                                            <td>{r.responseTimeMs}ms</td>
                                            <td>{r.statusCode ?? '—'}</td>
                                            <td className="history-error">
                                                {r.error || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
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

            {/* Recent Notifications */}
            {isAdmin && (
            <div className="card" style={{ marginTop: 16 }}>
                <div className="section-header" style={{ marginBottom: 16 }}>
                    <h3>Recent Notifications</h3>
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
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Channel</th>
                                    <th>Status</th>
                                    <th>Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentNotifications.map((n) => (
                                    <tr key={n.id}>
                                        <td className="history-timestamp">
                                            {new Date(n.timestamp).toLocaleString()}
                                        </td>
                                        <td>
                                            <span style={{
                                                backgroundColor: n.channel === 'TELEGRAM' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                                                color: n.channel === 'TELEGRAM' ? '#60a5fa' : '#c084fc',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                            }}>
                                                {n.channel}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${n.status === 'SUCCESS' ? 'up' : 'down'}`}>
                                                {n.status === 'SUCCESS' ? '✓ SUCCESS' : '✕ FAILED'}
                                            </span>
                                        </td>
                                        <td className="history-error">
                                            {n.error || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            )}
        </div>
    );
}
