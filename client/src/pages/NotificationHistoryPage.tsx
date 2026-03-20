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

    const successCount = history.filter(entry => entry.status === 'SUCCESS').length;
    const failureCount = history.filter(entry => entry.status === 'FAILED').length;
    const telegramCount = history.filter(entry => entry.channel === 'TELEGRAM').length;
    const zulipCount = history.filter(entry => entry.channel === 'ZULIP').length;

    return (
        <div className="app-container page-container admin-page">
            <div className="dashboard-toolbar">
                <div className="dashboard-toolbar-copy">
                    <h2>Notification History</h2>
                    <p>
                        Delivery audit for outbound alerts across Telegram and Zulip.
                        {monitorId && monitors[monitorId] ? ` Filtered to ${monitors[monitorId]}.` : ''}
                    </p>
                </div>
                <div className="admin-toolbar-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => monitorId ? navigate(`/monitors/${monitorId}/history`) : navigate('/settings')}
                    >
                        ← Back
                    </button>
                </div>
            </div>

            <div className="dashboard-summary-cards">
                <div className="dashboard-summary-card">
                    <span>Total records</span>
                    <strong>{total}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Successful</span>
                    <strong className="admin-summary-value success">{successCount}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Failed</span>
                    <strong>{failureCount}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Channels in view</span>
                    <strong>{telegramCount > 0 && zulipCount > 0 ? '2' : telegramCount > 0 || zulipCount > 0 ? '1' : '0'}</strong>
                </div>
            </div>

            <div className="agents-section-card">
                <div className="section-header">
                    <h2>Delivery Log</h2>
                    <span className="pagination-info">Page {page} of {totalPages}</span>
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
                                        <td className="history-timestamp">
                                            {new Date(entry.timestamp).toLocaleString()}
                                        </td>
                                        <td>
                                            {entry.monitorId ? (
                                                <div className="admin-entity-primary">
                                                    <strong>{monitors[entry.monitorId] || 'Deleted Monitor'}</strong>
                                                </div>
                                            ) : (
                                                <span className="admin-table-muted">Test Auth</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`history-channel-badge ${entry.channel === 'TELEGRAM' ? 'telegram' : 'zulip'}`}>
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
                                                <span className="admin-table-muted">—</span>
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
