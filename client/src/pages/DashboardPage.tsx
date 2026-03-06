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
}

export default function DashboardPage({
    monitors,
    loading,
    onCreateMonitor,
    onUpdateMonitor,
    onDeleteMonitor,
    onToggleMonitor,
}: DashboardPageProps) {
    const { isAdmin } = useAuth();
    const navigate = useNavigate();
    const [showForm, setShowForm] = useState(false);
    const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);

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
        if (!confirm('Are you sure?')) return;
        await onDeleteMonitor(id);
    };

    return (
        <>
            {isAdmin && (
                <div style={{ marginBottom: 16 }}>
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        ＋ New Monitor
                    </button>
                </div>
            )}

            {/* Monitor Grid */}
            {loading && monitors.length === 0 ? (
                <div className="empty-state">
                    <h3>Loading monitors...</h3>
                </div>
            ) : monitors.length === 0 ? (
                <div className="empty-state">
                    <h3>No monitors yet</h3>
                    <p>Create your first monitor to start tracking uptime.</p>
                    {isAdmin && (
                        <button
                            className="btn btn-primary"
                            style={{ marginTop: 16 }}
                            onClick={() => setShowForm(true)}
                        >
                            ＋ Create Monitor
                        </button>
                    )}
                </div>
            ) : (
                <div className="monitors-grid">
                    {monitors.map((monitor) => (
                        <MonitorCard
                            key={monitor.id}
                            monitor={monitor}
                            isAdmin={isAdmin}
                            onEdit={setEditingMonitor}
                            onDelete={handleDelete}
                            onToggle={onToggleMonitor}
                            onHistory={(m) => navigate(`/monitors/${m.id}/history`)}
                        />
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
        </>
    );
}
