import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api';
import type { NotificationHistoryEntry, Monitor } from '@uptime-monitor/shared';

export default function NotificationHistoryPage() {
    const navigate = useNavigate();
    const [history, setHistory] = useState<NotificationHistoryEntry[]>([]);
    const [monitors, setMonitors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchParams] = useSearchParams();
    const monitorId = searchParams.get('monitorId');

    const limit = 20;

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const query = monitorId ? `?page=${page}&limit=${limit}&monitorId=${monitorId}` : `?page=${page}&limit=${limit}`;
            const [historyRes, monitorsRes] = await Promise.all([
                apiClient.get(`/notifications/history${query}`),
                apiClient.get('/monitors')
            ]);

            setHistory(historyRes.data.history);
            setTotalPages(historyRes.data.pagination.totalPages);
            setTotal(historyRes.data.pagination.total);

            const monitorsMap: Record<string, string> = {};
            monitorsRes.data.forEach((m: Monitor) => {
                monitorsMap[m.id] = m.name;
            });
            setMonitors(monitorsMap);
        } catch (err) {
            console.error('Failed to fetch notification history:', err);
        } finally {
            setLoading(false);
        }
    }, [page, limit, monitorId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div>
            <div className="app-header" style={{ marginTop: 24, padding: 0 }}>
                <div>
                    <h1>📬 Notification History</h1>
                    {monitorId && monitors[monitorId] && (
                        <div className="history-subtitle">Filtered by monitor: {monitors[monitorId]}</div>
                    )}
                </div>
                <button className="btn btn-secondary" onClick={() => monitorId ? navigate(`/monitor/${monitorId}`) : navigate('/settings')}>
                    ← Back
                </button>
            </div>

            <div className="card">
                <div className="section-header">
                    <h2>History Log</h2>
                    <span className="pagination-info">Total records: {total}</span>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Monitor</th>
                                <th>Channel</th>
                                <th>Status</th>
                                <th>Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>
                                        Loading...
                                    </td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>
                                        No notifications sent yet.
                                    </td>
                                </tr>
                            ) : (
                                history.map(entry => (
                                    <tr key={entry.id}>
                                        <td style={{ whiteSpace: 'nowrap' }} className="history-timestamp">
                                            {new Date(entry.timestamp).toLocaleString()}
                                        </td>
                                        <td>
                                            {entry.monitorId ? (
                                                <strong>{monitors[entry.monitorId] || 'Deleted Monitor'}</strong>
                                            ) : (
                                                <span className="history-subtitle">Test Auth</span>
                                            )}
                                        </td>
                                        <td>
                                            <span style={{
                                                backgroundColor: entry.channel === 'TELEGRAM' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                                                color: entry.channel === 'TELEGRAM' ? '#60a5fa' : '#c084fc',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                            }}>
                                                {entry.channel}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${entry.status === 'SUCCESS' ? 'up' : 'down'}`}>
                                                {entry.status === 'SUCCESS' ? '✓ SUCCESS' : '✕ FAILED'}
                                            </span>
                                        </td>
                                        <td>
                                            {entry.error ? (
                                                <div className="history-error" title={entry.error}>
                                                    {entry.error}
                                                </div>
                                            ) : (
                                                <span className="history-subtitle">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="pagination">
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            Previous
                        </button>
                        <span className="pagination-info">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
