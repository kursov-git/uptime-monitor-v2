import { Monitor } from '../api';

interface MonitorCardProps {
    monitor: Monitor;
    isAdmin: boolean;
    onEdit: (monitor: Monitor) => void;
    onDelete: (id: string) => void;
    onToggle: (id: string) => void;
    onTogglePublic: (id: string, isPublic: boolean) => void;
    onHistory: (monitor: Monitor) => void;
}

export default function MonitorCard({ monitor, isAdmin, onEdit, onDelete, onToggle, onTogglePublic, onHistory }: MonitorCardProps) {
    const lastCheck = monitor.lastCheck;
    const isHttpMonitor = monitor.type === 'HTTP';
    const sslThresholdDays = monitor.sslExpiryThresholdDays ?? 14;
    const hasSslSnapshot = isHttpMonitor && monitor.sslExpiryEnabled && lastCheck?.sslDaysRemaining !== null && lastCheck?.sslDaysRemaining !== undefined;
    const sslWarning = hasSslSnapshot && (lastCheck!.sslDaysRemaining as number) <= sslThresholdDays;

    const getStatus = () => {
        if (!monitor.isActive) return 'paused';
        if (monitor.flappingState?.isFlapping) return 'flapping';
        if (!lastCheck) return 'unknown';
        return lastCheck.isUp ? 'up' : 'down';
    };

    const status = getStatus();


    const statusLabel: Record<string, string> = {
        up: 'Up',
        down: 'Down',
        paused: 'Paused',
        unknown: 'Unknown',
        flapping: 'Flapping',
    };

    const formatTime = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    const formatInterval = (sec: number) => {
        if (sec < 1) return `${(sec * 1000).toFixed(0)}ms`;
        if (sec < 60) return `${sec}s`;
        if (sec < 3600) return `${Math.round(sec / 60)}m`;
        return `${Math.round(sec / 3600)}h`;
    };

    const monitorTypeLabel = monitor.type === 'DNS'
        ? `DNS ${monitor.dnsRecordType}`
        : monitor.type === 'TCP'
            ? 'TCP'
            : monitor.method;

    const sslSummary = hasSslSnapshot
        ? (lastCheck!.sslDaysRemaining as number) <= 0
            ? 'SSL expired'
            : `SSL expires in ${lastCheck!.sslDaysRemaining} day${lastCheck!.sslDaysRemaining === 1 ? '' : 's'}`
        : isHttpMonitor && monitor.sslExpiryEnabled
            ? 'SSL expiry pending first HTTPS check'
            : null;

    const trashIcon = (
        <svg
            className="monitor-trash-icon"
            viewBox="0 0 256 256"
            aria-hidden="true"
            focusable="false"
        >
            <rect width="256" height="256" rx="64" fill="currentColor" fillOpacity="0.12" />
            <rect x="56" y="72" width="144" height="18" rx="9" fill="currentColor" fillOpacity="0.35" />
            <rect x="83" y="90" width="90" height="108" rx="24" fill="currentColor" />
            <rect x="106" y="50" width="44" height="26" rx="13" fill="currentColor" />
            <path d="M107 117V171" stroke="white" strokeWidth="12" strokeLinecap="round" />
            <path d="M128 117V171" stroke="white" strokeWidth="12" strokeLinecap="round" />
            <path d="M149 117V171" stroke="white" strokeWidth="12" strokeLinecap="round" />
        </svg>
    );

    return (
        <div className="card monitor-card">
            <div className="monitor-card-main">
                <div className="monitor-card-header">
                    <div className="monitor-card-title-block">
                        <div className="monitor-name" title={monitor.name}>{monitor.name}</div>
                        <div className="monitor-url">{monitor.url}</div>
                    </div>
                </div>
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
                {sslSummary && (
                    <div
                        className={`monitor-ssl-summary ${sslWarning ? 'warning' : 'ok'}`}
                        title={lastCheck?.sslExpiresAt ? `Certificate expires at ${new Date(lastCheck.sslExpiresAt).toLocaleString()}` : undefined}
                    >
                        {sslSummary}
                    </div>
                )}
                <div className="monitor-stats">
                    <div className="stat">
                        <div className="stat-label">Resp</div>
                        <div className="stat-value">
                            {lastCheck ? formatTime(lastCheck.responseTimeMs) : '—'}
                        </div>
                    </div>
                    <div className="stat">
                        <div className="stat-label">Every</div>
                        <div className="stat-value">{formatInterval(monitor.intervalSeconds)}</div>
                    </div>
                    <div className="stat">
                        <div className="stat-label">Timeout</div>
                        <div className="stat-value">{monitor.timeoutSeconds}s</div>
                    </div>
                    <div className="stat">
                        <div className="stat-label">Checked</div>
                        <div className="stat-value">
                            {lastCheck ? new Date(lastCheck.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                    </div>
                </div>

            </div>

            <div className="monitor-card-side">
                <div className="monitor-side-status">
                    <span className={`status-dot ${status}`} title={statusLabel[status]} aria-label={statusLabel[status]} />
                </div>
                <div className="monitor-actions monitor-control-group">
                    <button
                        className="btn btn-icon btn-sm btn-secondary"
                        onClick={() => onHistory(monitor)}
                        title="History"
                    >
                        📊
                    </button>
                    {isAdmin && (
                        <>
                            <button
                                className={`btn btn-sm monitor-state-chip ${monitor.isPublic ? 'is-on public' : 'is-off public'}`}
                                onClick={() => onTogglePublic(monitor.id, !monitor.isPublic)}
                                title={monitor.isPublic ? 'Remove from public status page' : 'Publish on public status page'}
                            >
                                <span className="monitor-state-chip-icon">🌐</span>
                            </button>
                            <button
                                className={`btn btn-sm monitor-state-chip ${monitor.isActive ? 'is-on execution' : 'is-off execution'}`}
                                onClick={() => onToggle(monitor.id)}
                                title={monitor.isActive ? 'Pause' : 'Resume'}
                            >
                                <span className="monitor-state-chip-icon">{monitor.isActive ? '▶' : '⏸'}</span>
                            </button>
                            <button
                                className="btn btn-icon btn-sm btn-secondary"
                                onClick={() => onEdit(monitor)}
                                title="Edit"
                            >
                                ✏️
                            </button>
                            <button
                                className="btn btn-icon btn-sm btn-danger monitor-delete-action"
                                onClick={() => onDelete(monitor.id)}
                                title="Delete"
                            >
                                {trashIcon}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
