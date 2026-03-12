import { useEffect, useState } from 'react';
import { publicApi, type PublicStatusResponse } from '../api';

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
