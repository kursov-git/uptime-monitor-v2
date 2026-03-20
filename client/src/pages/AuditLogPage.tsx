import { useState, useEffect, useCallback } from 'react';
import { auditApi, AuditLogEntry } from '../api';

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const limit = 50;

    const fetchLogs = useCallback(async (currentOffset: number) => {
        setLoading(true);
        try {
            const res = await auditApi.get('/', {
                params: { limit, offset: currentOffset },
            });
            if (currentOffset === 0) {
                setLogs(res.data.logs);
            } else {
                setLogs(prev => [...prev, ...res.data.logs]);
            }
            setTotal(res.data.total);
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLogs(0);
    }, [fetchLogs]);

    const loadMore = () => {
        const newOffset = offset + limit;
        setOffset(newOffset);
        fetchLogs(newOffset);
    };

    const formatDate = (ts: string) => new Date(ts).toLocaleString();

    const formatAction = (action: string) => {
        const icons: Record<string, string> = {
            LOGIN: '🔑',
            LOGIN_FAILED: '🚫',
            LOGOUT: '👋',
            CREATE_MONITOR: '➕',
            UPDATE_MONITOR: '✏️',
            DELETE_MONITOR: '🗑',
            PAUSE_MONITOR: '⏸',
            RESUME_MONITOR: '▶️',
            CREATE_USER: '👤',
            DELETE_USER: '❌',
            PASSWORD_CHANGED: '🔒',
            GENERATE_API_KEY: '🔑',
            REVOKE_API_KEY: '🚫',
            AGENT_ONLINE: '🟢',
            AGENT_OFFLINE: '🔴',
        };
        return `${icons[action] || '📝'} ${action}`;
    };

    const parseDetails = (details: string | null): string => {
        if (!details) return '—';
        try {
            const obj = JSON.parse(details);
            return Object.entries(obj)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
        } catch {
            return details;
        }
    };

    const userCount = new Set(logs.map(log => log.user?.username).filter(Boolean)).size;
    const authEvents = logs.filter(log => log.action.includes('LOGIN') || log.action.includes('LOGOUT')).length;

    return (
        <div className="app-container page-container admin-page">
            <div className="dashboard-toolbar">
                <div className="dashboard-toolbar-copy">
                    <h2 data-testid="audit-page-title">Audit Log</h2>
                    <p>Review operator actions, authentication events, and change history across monitors, agents, and access control.</p>
                </div>
            </div>

            <div className="dashboard-summary-cards">
                <div className="dashboard-summary-card">
                    <span>Total entries</span>
                    <strong>{total}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Loaded</span>
                    <strong>{logs.length}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Actors in view</span>
                    <strong>{userCount}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Auth events</span>
                    <strong>{authEvents}</strong>
                </div>
            </div>

            <div className="agents-section-card">
                <div className="section-header">
                    <h2>Activity Stream</h2>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Action</th>
                                <th>User</th>
                                <th>Details</th>
                                <th>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => (
                                <tr key={log.id}>
                                    <td className="history-timestamp">{formatDate(log.timestamp)}</td>
                                    <td>
                                        <div className="admin-entity-primary">
                                            <strong>{formatAction(log.action)}</strong>
                                        </div>
                                    </td>
                                    <td>{log.user?.username || '—'}</td>
                                    <td className="admin-table-secondary">{parseDetails(log.details)}</td>
                                    <td className="admin-table-muted">{log.ipAddress || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {logs.length === 0 && !loading && (
                    <div className="empty-state">
                        <h3>No audit log entries</h3>
                    </div>
                )}

                {logs.length < total && (
                    <div className="pagination">
                        <button className="btn btn-secondary" onClick={loadMore} disabled={loading}>
                            {loading ? 'Loading...' : `Load More (${total - logs.length} remaining)`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
