import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import AuditLogPage from './pages/AuditLogPage';
import NotificationSettings from './pages/NotificationSettings';
import NotificationHistoryPage from './pages/NotificationHistoryPage';
import MonitorHistory from './pages/MonitorHistory';
import DashboardPage from './pages/DashboardPage';
import AgentsPage from './pages/AgentsPage';
import { useMonitors } from './hooks/useMonitors';

export default function App() {
    const { isAuthenticated, isAdmin, isLoading, user, logout } = useAuth();
    const navigate = useNavigate();
    const {
        monitors, loading, fetchMonitors,
        createMonitor, updateMonitor, deleteMonitor, toggleMonitor,
        handleSSEUpdate,
    } = useMonitors();

    useEffect(() => {
        if (!isAuthenticated) return;

        fetchMonitors();

        // Connect to SSE for real-time updates
        const token = localStorage.getItem('token');
        const url = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/monitors/stream` : '/api/monitors/stream';
        const sse = new EventSource(`${url}?token=${token}`);

        sse.addEventListener('monitor_update', (event) => {
            try {
                const updatedMonitor = JSON.parse(event.data);
                handleSSEUpdate(updatedMonitor);
            } catch (err) {
                console.error('Failed to parse SSE monitor update', err);
            }
        });

        sse.addEventListener('error', (err) => {
            console.error('SSE Error:', err);
        });

        return () => {
            sse.close();
        };
    }, [isAuthenticated, fetchMonitors, handleSSEUpdate]);

    if (isLoading) {
        return (
            <div className="login-container">
                <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginPage />;
    }

    return (
        <div className="app-container page-container">
            {/* Header */}
            <div className="app-header">
                <h1>Uptime Admin</h1>
                <div className="header-actions">
                    <span className="header-user">
                        {user?.username} ({user?.role})
                    </span>
                    {isAdmin && (
                        <>
                            <Link to="/settings" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                                ⚙️ Settings
                            </Link>
                            <Link to="/users" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                                👥 Users
                            </Link>
                            <Link to="/audit" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                                📋 Audit Log
                            </Link>
                            <Link to="/agents" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                                🛰 Agents
                            </Link>
                        </>
                    )}
                    <button className="btn btn-secondary" onClick={logout}>
                        Logout
                    </button>
                </div>
            </div>

            {/* Routes */}
            <Routes>
                <Route path="/" element={
                    <DashboardPage
                        monitors={monitors}
                        loading={loading}
                        onCreateMonitor={createMonitor}
                        onUpdateMonitor={updateMonitor}
                        onDeleteMonitor={deleteMonitor}
                        onToggleMonitor={toggleMonitor}
                    />
                } />

                <Route path="/users" element={
                    isAdmin ? (
                        <div>
                            <div className="app-header" style={{ marginTop: 24, padding: 0 }}>
                                <h1>👥 User Management</h1>
                                <button className="btn btn-secondary" onClick={() => navigate('/')}>
                                    ← Back
                                </button>
                            </div>
                            <UsersPage />
                        </div>
                    ) : (
                        <div className="empty-state"><h3>Unauthorized</h3></div>
                    )
                } />

                <Route path="/audit" element={
                    isAdmin ? (
                        <div>
                            <div className="app-header" style={{ marginTop: 24, padding: 0 }}>
                                <h1>📋 Audit Log</h1>
                                <button className="btn btn-secondary" onClick={() => navigate('/')}>
                                    ← Back
                                </button>
                            </div>
                            <AuditLogPage />
                        </div>
                    ) : (
                        <div className="empty-state"><h3>Unauthorized</h3></div>
                    )
                } />

                <Route path="/settings" element={
                    isAdmin ? (
                        <div>
                            <NotificationSettings />
                        </div>
                    ) : (
                        <div className="empty-state"><h3>Unauthorized</h3></div>
                    )
                } />

                <Route path="/settings/history" element={
                    isAdmin ? (
                        <div>
                            <NotificationHistoryPage />
                        </div>
                    ) : (
                        <div className="empty-state"><h3>Unauthorized</h3></div>
                    )
                } />

                <Route path="/agents" element={
                    isAdmin ? (
                        <div>
                            <div className="app-header" style={{ marginTop: 24, padding: 0 }}>
                                <h1>🛰 Agents</h1>
                                <button className="btn btn-secondary" onClick={() => navigate('/')}>
                                    ← Back
                                </button>
                            </div>
                            <AgentsPage />
                        </div>
                    ) : (
                        <div className="empty-state"><h3>Unauthorized</h3></div>
                    )
                } />

                <Route path="/monitors/:id/history" element={
                    <MonitorHistory onBack={() => navigate('/')} />
                } />

                <Route path="*" element={
                    <div className="empty-state">
                        <h3>Page not found</h3>
                        <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
                    </div>
                } />
            </Routes>
        </div>
    );
}
