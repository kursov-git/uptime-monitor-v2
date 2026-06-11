import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { monitorsApi, notificationsApi, CheckResult, Monitor } from '../api';
import type { MonitorStatsPath } from '../api';
import type { NotificationHistoryEntry } from '@uptime-monitor/shared';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea
} from 'recharts';
import { useParams, useNavigate } from 'react-router-dom';
import TimeRangeFilter, { TimeRangeValue, computeAbsoluteRange, resolveTimeRangeLabel } from '../components/TimeRangeFilter';
import { useAuth } from '../contexts/AuthContext';
import {
    buildChartTickIndexes,
    buildChartPoints,
    detailCheckError,
    downsampleChartData,
    formatChartPointsForSpan,
    getChartSpanMs,
    getChartHoverIndex,
    summarizeCheckError,
} from '../lib/monitorHistoryChart';
import type { ChartPoint } from '../lib/monitorHistoryChart';
import { buildMonitorHistorySummary, monitorHistoryStatusLabel } from '../lib/monitorHistorySummary';

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_TIME_RANGE: TimeRangeValue = 'now-1h';
const DEFAULT_INTERVAL_SECONDS = 60;
const MAX_CHART_POINTS = 100000;
const MAX_RENDERED_CHART_POINTS = 1800;

interface ChartTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: ChartPoint }>;
}

interface ChartDotProps {
    cx?: number;
    cy?: number;
    payload?: ChartPoint;
}

function estimateChartPointLimit(
    range: TimeRangeValue,
    intervalSeconds: number = DEFAULT_INTERVAL_SECONDS,
): number {
    const safeIntervalSeconds = Math.max(1, intervalSeconds || DEFAULT_INTERVAL_SECONDS);
    const { from, to } = computeAbsoluteRange(range);

    if (!from || !to || to <= from) {
        return 1000;
    }

    const durationMs = to - from;
    const expectedPoints = Math.ceil(durationMs / (safeIntervalSeconds * 1000)) + 4;

    return Math.max(300, Math.min(MAX_CHART_POINTS, expectedPoints));
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
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRangeValue>(DEFAULT_TIME_RANGE);
    const [chartSelection, setChartSelection] = useState<{ startIndex: number | null; endIndex: number | null }>({
        startIndex: null,
        endIndex: null,
    });
    const deferredChartResults = useDeferredValue(chartResults);
    const rawChartData = useMemo(() => buildChartPoints(deferredChartResults), [deferredChartResults]);
    const chartData = useMemo(() => downsampleChartData(rawChartData, MAX_RENDERED_CHART_POINTS), [rawChartData]);
    const chartSpanMs = getChartSpanMs(chartData);
    const chartDataWithFormattedTicks = useMemo(() => formatChartPointsForSpan(chartData), [chartData]);
    const chartTickIndexes = useMemo(() => buildChartTickIndexes(chartDataWithFormattedTicks, chartSpanMs), [chartDataWithFormattedTicks, chartSpanMs]);

    const fetchHistory = useCallback(async () => {
        if (!monitorId) return;
        try {
            setLoading(true);
            const { from, to } = computeAbsoluteRange(timeRange);
            const monitorRes = await monitorsApi.get(`/${monitorId}`);
            const chartLimit = estimateChartPointLimit(timeRange, monitorRes.data.intervalSeconds);

            let statsUrl = `/${monitorId}/stats?limit=${pageSize}&offset=${offset}`;
            if (from) statsUrl += `&from=${from}`;
            if (to) statsUrl += `&to=${to}`;

            let chartUrl = `/${monitorId}/stats?limit=${chartLimit}&offset=0`;
            if (from) chartUrl += `&from=${from}`;
            if (to) chartUrl += `&to=${to}`;
            chartUrl += `&sampleTo=${MAX_RENDERED_CHART_POINTS}`;

            const [statsRes, chartRes] = await Promise.all([
                monitorsApi.get(statsUrl as MonitorStatsPath),
                monitorsApi.get(chartUrl as MonitorStatsPath),
            ]);
            setMonitor(monitorRes.data);
            setResults(statsRes.data.results);
            setTotal(statsRes.data.total);
            setOverallUptime(statsRes.data.overallUptimePercent || '—');
            setOverallAvgRes(statsRes.data.overallAvgResponseMs || 0);
            setChartResults(chartRes.data.results);
            if (isAdmin) {
                try {
                    const notifRes = await notificationsApi.get(`/history?limit=5&monitorId=${monitorId}`);
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
    }, [isAdmin, monitorId, offset, pageSize, timeRange]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const handleTimeRangeChange = (newRange: TimeRangeValue) => {
        setTimeRange(newRange);
        setOffset(0);
        setChartSelection({ startIndex: null, endIndex: null });
    };

    const handlePageSizeChange = (nextSize: number) => {
        setPageSize(nextSize);
        setOffset(0);
    };

    const handleResetZoom = () => {
        setTimeRange(DEFAULT_TIME_RANGE);
        setOffset(0);
        setChartSelection({ startIndex: null, endIndex: null });
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

    const hasChartSelection = chartSelection.startIndex !== null && chartSelection.endIndex !== null;
    const chartSelectionStart = hasChartSelection ? Math.min(chartSelection.startIndex!, chartSelection.endIndex!) : null;
    const chartSelectionEnd = hasChartSelection ? Math.max(chartSelection.startIndex!, chartSelection.endIndex!) : null;

    const historySummary = buildMonitorHistorySummary({
        monitor,
        results,
        chartResults,
        total,
        pageSize,
        offset,
        overallUptime,
        overallAvgRes,
    });
    const {
        uptimePercent,
        avgResponseTime,
        latestResult,
        sslSummary,
        totalPages,
        currentPage,
        latestStatus,
        monitorTypeLabel,
        latestCheckedAt,
    } = historySummary;
    const isZoomedRange = typeof timeRange === 'object';

    const CustomTooltip = ({ active, payload }: ChartTooltipProps) => {
        const data = payload?.[0]?.payload;
        if (!active || !data) return null;
        return (
            <div className="history-tooltip">
                <div className="history-tooltip-time">{data.timeLabel}</div>
                <div className="history-tooltip-grid">
                    <div className={`history-tooltip-status ${data.isUp ? 'up' : 'down'}`}>
                        {data.isUp ? '● UP' : '● DOWN'}
                    </div>
                    <div className="history-tooltip-value">{data.responseTime}ms</div>
                    <div className="history-tooltip-meta">
                        HTTP {data.statusCode ?? '—'}
                    </div>
                </div>
            </div>
        );
    };

    const handleChartMouseDown = (state: unknown) => {
        const hoverIndex = getChartHoverIndex(state);
        if (hoverIndex === null) return;
        setChartSelection({ startIndex: hoverIndex, endIndex: hoverIndex });
    };

    const handleChartMouseMove = (state: unknown) => {
        const hoverIndex = getChartHoverIndex(state);
        if (chartSelection.startIndex === null || hoverIndex === null) return;
        setChartSelection((current) => ({ ...current, endIndex: hoverIndex }));
    };

    const handleChartMouseUp = () => {
        if (chartSelection.startIndex === null || chartSelection.endIndex === null) {
            return;
        }

        if (chartSelection.startIndex === chartSelection.endIndex) {
            setChartSelection({ startIndex: null, endIndex: null });
            return;
        }

        const minIndex = Math.min(chartSelection.startIndex, chartSelection.endIndex);
        const maxIndex = Math.max(chartSelection.startIndex, chartSelection.endIndex);
        const fromPoint = chartDataWithFormattedTicks[minIndex];
        const toPoint = chartDataWithFormattedTicks[maxIndex];

        if (!fromPoint || !toPoint) {
            setChartSelection({ startIndex: null, endIndex: null });
            return;
        }

        handleTimeRangeChange({
            from: new Date(fromPoint.timestampMs),
            to: new Date(toPoint.timestampMs),
            label: `${fromPoint.timeLabel} to ${toPoint.timeLabel}`,
        });
    };

    const handleChartDoubleClick = () => {
        if (isZoomedRange) {
            handleResetZoom();
            return;
        }

        setChartSelection({ startIndex: null, endIndex: null });
    };

    return (
        <div className="app-container page-container history-page">
            <div className="dashboard-toolbar">
                <div className="dashboard-toolbar-copy">
                    <h2>Monitor History</h2>
                    <p>Detailed response history, validation output, and recent notification delivery for a single monitor.</p>
                </div>
                <div className="history-toolbar-actions">
                    <TimeRangeFilter
                        value={timeRange}
                        onChange={handleTimeRangeChange}
                        canResetZoom={isZoomedRange}
                        onResetZoom={handleResetZoom}
                    />
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
                        <span className={`status-badge ${latestStatus}`}>{monitorHistoryStatusLabel[latestStatus]}</span>
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
                    <div>
                        <h2>Response Time</h2>
                        <p className="section-subtitle">
                            Drag to zoom into an exact window. Double-click to reset.
                        </p>
                        {isZoomedRange && (
                            <div className="history-zoom-chip">
                                {resolveTimeRangeLabel(timeRange)}
                            </div>
                        )}
                    </div>
                    {isZoomedRange && (
                        <button className="btn btn-secondary btn-sm" onClick={handleResetZoom}>
                            Reset zoom
                        </button>
                    )}
                </div>
                {chartData.length > 0 ? (
                    <div className="history-chart-shell history-chart-zoomable">
                        <ResponsiveContainer width="100%" height={300}>
                        <AreaChart
                            data={chartDataWithFormattedTicks}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            onMouseDown={handleChartMouseDown}
                            onMouseMove={handleChartMouseMove}
                            onMouseUp={handleChartMouseUp}
                            onDoubleClick={handleChartDoubleClick}
                        >
                            <defs>
                                <linearGradient id="responseGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#d5e1ea" />
                            <XAxis
                                dataKey="index"
                                ticks={chartTickIndexes}
                                interval={0}
                                stroke="#64748b"
                                fontSize={11}
                                tickLine={false}
                                tickFormatter={(value) => {
                                    const numericValue = Number(value);
                                    if (!Number.isFinite(numericValue)) return '';
                                    return chartDataWithFormattedTicks[numericValue]?.time ?? '';
                                }}
                            />
                            <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}ms`} />
                            <Tooltip content={<CustomTooltip />} />
                            {chartSelectionStart !== null && chartSelectionEnd !== null && (
                                <ReferenceArea
                                    x1={chartSelectionStart}
                                    x2={chartSelectionEnd}
                                    fill="#9ec5ff"
                                    fillOpacity={0.18}
                                    strokeOpacity={0}
                                />
                            )}
                            <Area
                                type="monotone"
                                dataKey="responseTime"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#responseGrad)"
                                isAnimationActive={false}
                                dot={chartDataWithFormattedTicks.length <= 1200 ? ((props: unknown) => {
                                    const { cx, cy, payload } = props as ChartDotProps;
                                    if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
                                        return <circle r={0} />;
                                    }
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
                                }) : false}
                            />
                        </AreaChart>
                        </ResponsiveContainer>
                    </div>
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

                        <div className="pagination">
                            <label className="pagination-size-control">
                                <span>Rows</span>
                                <select
                                    value={pageSize}
                                    onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                                >
                                    {PAGE_SIZE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </label>
                            <button
                                className="btn btn-sm btn-secondary"
                                disabled={offset === 0}
                                onClick={() => setOffset(Math.max(0, offset - pageSize))}
                            >
                                ← Prev
                            </button>
                            <span className="pagination-info">
                                Page {currentPage} of {Math.max(1, totalPages)}
                            </span>
                            <button
                                className="btn btn-sm btn-secondary"
                                disabled={offset + pageSize >= total}
                                onClick={() => setOffset(offset + pageSize)}
                            >
                                Next →
                            </button>
                        </div>
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
                        <div className="history-results-list history-ledger notification-ledger">
                            <div className="history-ledger-head notification-ledger-head" aria-hidden="true">
                                <span>Timestamp</span>
                                <span>Channel</span>
                                <span>Status</span>
                                <span>Delivery</span>
                            </div>
                            {recentNotifications.map((n) => (
                                <article key={n.id} className="history-ledger-row notification-ledger-row">
                                    <div className="history-ledger-time">
                                        {new Date(n.timestamp).toLocaleString()}
                                    </div>
                                    <div className="history-ledger-status">
                                        <span className={`history-channel-badge ${n.channel === 'TELEGRAM' ? 'telegram' : 'zulip'}`}>
                                            {n.channel}
                                        </span>
                                    </div>
                                    <div className="history-ledger-status">
                                        <span className={`status-badge ${n.status === 'SUCCESS' ? 'up' : 'down'}`}>
                                            {n.status === 'SUCCESS' ? '✓ SUCCESS' : '✕ FAILED'}
                                        </span>
                                    </div>
                                    <div className="history-ledger-detail notification-ledger-detail" title={n.error || 'Delivered successfully'}>
                                        {n.error || 'Delivered successfully'}
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
