import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Monitor, MonitorFormData } from '../api';
import MonitorCard from '../components/MonitorCard';
import MonitorForm from '../components/MonitorForm';

interface DashboardPageProps {
    monitors: Monitor[];
    loading: boolean;
    onCreateMonitor: (data: MonitorFormData) => Promise<void>;
    onUpdateMonitor: (id: string, data: MonitorFormData) => Promise<void>;
    onDeleteMonitor: (id: string) => Promise<void>;
    onToggleMonitor: (id: string) => Promise<void>;
    onTogglePublicVisibility: (id: string, isPublic: boolean) => Promise<void>;
}

export default function DashboardPage({
    monitors,
    loading,
    onCreateMonitor,
    onUpdateMonitor,
    onDeleteMonitor,
    onToggleMonitor,
    onTogglePublicVisibility,
}: DashboardPageProps) {
    const { isAdmin } = useAuth();
    const navigate = useNavigate();
    const [showForm, setShowForm] = useState(false);
    const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
    const [deleteCandidate, setDeleteCandidate] = useState<Monitor | null>(null);

    const getMonitorStatus = (monitor: Monitor) => {
        if (!monitor.isActive) return 'paused';
        if (monitor.flappingState?.isFlapping) return 'flapping';
        if (!monitor.lastCheck) return 'unknown';
        return monitor.lastCheck.isUp ? 'up' : 'down';
    };

    const buildServiceDescription = (serviceMonitors: Monitor[]) => {
        const typeLabels = Array.from(new Set(serviceMonitors.map((monitor) => (
            monitor.type === 'DNS'
                ? `DNS ${monitor.dnsRecordType}`
                : monitor.type === 'TCP'
                    ? 'TCP'
                    : `HTTP ${monitor.method}`
        ))));
        const publicCount = serviceMonitors.filter((monitor) => monitor.isPublic).length;
        const coverage = typeLabels.slice(0, 3).join(', ');
        const suffix = publicCount > 0 ? ` ${publicCount} public.` : '';
        return `${coverage} coverage.${suffix}`;
    };

    const groupedMonitors = monitors.reduce((acc, monitor) => {
        const key = monitor.serviceName?.trim() || 'Standalone Monitors';
        const existing = acc.get(key);
        if (existing) {
            existing.push(monitor);
        } else {
            acc.set(key, [monitor]);
        }
        return acc;
    }, new Map<string, Monitor[]>());

    const serviceSections = Array.from(groupedMonitors.entries())
        .sort(([a], [b]) => {
            if (a === 'Standalone Monitors') return 1;
            if (b === 'Standalone Monitors') return -1;
            return a.localeCompare(b);
        })
        .map(([serviceName, serviceMonitors]) => {
            const summary = serviceMonitors.reduce((acc, monitor) => {
                const status = getMonitorStatus(monitor);
                if (status === 'down' || status === 'flapping') acc.attention += 1;
                else if (status === 'up') acc.up += 1;
                else if (status === 'paused') acc.paused += 1;
                else acc.unknown += 1;
                if (monitor.isPublic) acc.publicCount += 1;
                return acc;
            }, { up: 0, attention: 0, paused: 0, unknown: 0, publicCount: 0 });

            return {
                serviceName,
                monitors: serviceMonitors,
                summary,
                description: buildServiceDescription(serviceMonitors),
            };
        });

    const overallSummary = monitors.reduce((acc, monitor) => {
        const status = getMonitorStatus(monitor);
        if (status === 'down' || status === 'flapping') acc.attention += 1;
        if (status === 'up') acc.up += 1;
        if (status === 'paused') acc.paused += 1;
        if (status === 'unknown') acc.unknown += 1;
        if (monitor.isPublic) acc.publicCount += 1;
        if (monitor.sslExpiryEnabled) acc.sslEnabled += 1;
        return acc;
    }, { attention: 0, up: 0, paused: 0, unknown: 0, publicCount: 0, sslEnabled: 0 });

    const handleCreate = async (data: MonitorFormData) => {
        await onCreateMonitor(data);
        setShowForm(false);
    };

    const handleUpdate = async (data: MonitorFormData) => {
        if (!editingMonitor) return;
        await onUpdateMonitor(editingMonitor.id, data);
        setEditingMonitor(null);
    };

    const handleDelete = async (id: string) => {
        const monitor = monitors.find((item) => item.id === id);
        if (!monitor) return;
        setDeleteCandidate(monitor);
    };

    const confirmDelete = async () => {
        if (!deleteCandidate) return;
        await onDeleteMonitor(deleteCandidate.id);
        setDeleteCandidate(null);
    };

    return (
        <div className="dashboard-page">
            <div className="dashboard-toolbar">
                <div className="dashboard-toolbar-copy">
                    <h2>Monitors</h2>
                    <p>Focused cards with clearer actions, grouped by service and tuned for quick operator scanning.</p>
                </div>
                <div className="admin-toolbar-actions">
                    {monitors.length > 0 && (
                        <span className="monitor-toolbar-hint">
                            {serviceSections.length} {serviceSections.length === 1 ? 'service section' : 'service sections'}
                        </span>
                    )}
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={() => setShowForm(true)} data-testid="new-monitor-button">
                            ＋ New Monitor
                        </button>
                    )}
                </div>
            </div>

            {monitors.length > 0 && (
                <div className="dashboard-summary-cards">
                    <div className="dashboard-summary-card">
                        <span>Total monitors</span>
                        <strong>{monitors.length}</strong>
                    </div>
                    <div className="dashboard-summary-card">
                        <span>Need attention</span>
                        <strong>{overallSummary.attention}</strong>
                    </div>
                    <div className="dashboard-summary-card">
                        <span>Healthy</span>
                        <strong className="admin-summary-value success">{overallSummary.up}</strong>
                    </div>
                    <div className="dashboard-summary-card">
                        <span>Public checks</span>
                        <strong>{overallSummary.publicCount}</strong>
                    </div>
                    <div className="dashboard-summary-card">
                        <span>SSL watched</span>
                        <strong>{overallSummary.sslEnabled}</strong>
                    </div>
                </div>
            )}

            {/* Monitor Grid */}
            {loading && monitors.length === 0 ? (
                <div className="empty-state">
                    <h3>Loading monitors...</h3>
                </div>
            ) : monitors.length === 0 ? (
                <div className="agents-section-card monitor-empty-state-card">
                    <div className="empty-state">
                        <h3>No monitors yet</h3>
                        <p>Create your first monitor to start tracking uptime, validation, SSL expiry, and service-level status.</p>
                        {isAdmin && (
                            <button
                                className="btn btn-primary"
                                style={{ marginTop: 16 }}
                                onClick={() => setShowForm(true)}
                                data-testid="create-monitor-empty-button"
                            >
                                ＋ Create Monitor
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="monitor-service-sections">
                    {serviceSections.map(({ serviceName, monitors: serviceMonitors, summary, description }) => (
                        <section key={serviceName} className="monitor-service-section">
                            <div className="monitor-service-section-header">
                                <div className="monitor-service-section-copy">
                                    <h2>{serviceName}</h2>
                                    <p>{description}</p>
                                </div>
                                <div className="monitor-service-summary">
                                    <span>{serviceMonitors.length} {serviceMonitors.length === 1 ? 'monitor' : 'monitors'}</span>
                                    {summary.publicCount > 0 && <span>{summary.publicCount} public</span>}
                                    {summary.attention > 0 && <span>{summary.attention} needs attention</span>}
                                    {summary.attention === 0 && summary.unknown === 0 && summary.paused === 0 && <span>all operational</span>}
                                    {summary.paused > 0 && <span>{summary.paused} paused</span>}
                                    {summary.unknown > 0 && <span>{summary.unknown} unknown</span>}
                                </div>
                            </div>
                            <div className="monitors-grid">
                                {serviceMonitors.map((monitor) => (
                                    <MonitorCard
                                        key={monitor.id}
                                        monitor={monitor}
                                        isAdmin={isAdmin}
                                        onEdit={setEditingMonitor}
                                        onDelete={handleDelete}
                                        onToggle={onToggleMonitor}
                                        onTogglePublic={onTogglePublicVisibility}
                                        onHistory={(m) => navigate(`/monitors/${m.id}/history`)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showForm && (
                <MonitorForm
                    onSubmit={handleCreate}
                    onCancel={() => setShowForm(false)}
                />
            )}

            {/* Edit Modal */}
            {editingMonitor && (
                <MonitorForm
                    monitor={editingMonitor}
                    onSubmit={handleUpdate}
                    onCancel={() => setEditingMonitor(null)}
                    onToggle={() => {
                        onToggleMonitor(editingMonitor.id);
                        setEditingMonitor(null);
                    }}
                />
            )}

            {deleteCandidate && (
                <div className="modal-overlay" onClick={() => setDeleteCandidate(null)}>
                    <div className="modal modal-compact delete-monitor-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="app-modal-kicker danger">Danger Zone</div>
                        <h2>Delete monitor?</h2>
                        <p className="app-modal-subtitle">
                            This permanently removes the monitor and its check history. This action cannot be undone.
                        </p>

                        <div className="delete-monitor-summary">
                            <strong>{deleteCandidate.name}</strong>
                            <span>{deleteCandidate.url}</span>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setDeleteCandidate(null)}>
                                Cancel
                            </button>
                            <button className="btn btn-danger" onClick={confirmDelete}>
                                Delete Monitor
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
