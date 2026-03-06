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

    const formatDate = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleString();
    };

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

    return (
        <div>
            <div className="section-header">
                <h2>Activity Log ({total} entries)</h2>
            </div>

            <div className="card">
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
                                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                        {formatDate(log.timestamp)}
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{formatAction(log.action)}</td>
                                    <td>{log.user?.username || '—'}</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                        {parseDetails(log.details)}
                                    </td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                        {log.ipAddress || '—'}
                                    </td>
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
