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
        up: '● UP',
        down: '● DOWN',
        paused: '⏸ PAUSED',
        unknown: '○ UNKNOWN',
        flapping: '⚠️ FLAPPING',
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

    return (
        <div className="card monitor-card">
            <div className="monitor-card-main">
                <div className="monitor-card-header">
                    <div className="monitor-card-title-block">
                        <div className="monitor-name">{monitor.name}</div>
                        <div className="monitor-url">{monitor.url}</div>
                    </div>
                    <div className="monitor-card-inline-status">
                        <span className={`status-badge ${status}`}>{statusLabel[status]}</span>
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
                <div className={`monitor-status-panel status-${status}`}>
                    <div className="monitor-status-panel-label">Status</div>
                    <span
                        className={`status-badge ${status}`}
                        title={monitor.flappingState?.isFlapping
                            ? `Diagnostic Info:\nFailures: ${monitor.flappingState.consecutiveFailures}\nSince: ${monitor.flappingState.firstFailureTime ? new Date(monitor.flappingState.firstFailureTime).toLocaleTimeString() : 'N/A'}\nError: ${monitor.flappingState.lastError || 'None'}`
                            : ''}
                    >
                        {statusLabel[status]}
                    </span>
                </div>

                <div className="monitor-actions monitor-actions-grid">
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
                                className={`btn btn-icon btn-sm ${monitor.isPublic ? 'btn-success' : 'btn-secondary'}`}
                                onClick={() => onTogglePublic(monitor.id, !monitor.isPublic)}
                                title={monitor.isPublic ? 'Remove from public status page' : 'Publish on public status page'}
                            >
                                🌐
                            </button>
                            <button
                                className="btn btn-icon btn-sm btn-secondary"
                                onClick={() => onToggle(monitor.id)}
                                title={monitor.isActive ? 'Pause' : 'Resume'}
                            >
                                {monitor.isActive ? '⏸' : '▶️'}
                            </button>
                            <button
                                className="btn btn-icon btn-sm btn-secondary"
                                onClick={() => onEdit(monitor)}
                                title="Edit"
                            >
                                ✏️
                            </button>
                            <button
                                className="btn btn-icon btn-sm btn-danger"
                                onClick={() => onDelete(monitor.id)}
                                title="Delete"
                            >
                                🗑
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
