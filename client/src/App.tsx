import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
import PublicStatusPage from './pages/PublicStatusPage';
import { useMonitors } from './hooks/useMonitors';

export default function App() {
    const { isAuthenticated, isAdmin, isLoading, user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isPublicStatusRoute = location.pathname === '/status';
    const {
        monitors, loading, fetchMonitors,
        createMonitor, updateMonitor, deleteMonitor, toggleMonitor,
        togglePublicVisibility,
        handleSSEUpdate,
    } = useMonitors();

    useEffect(() => {
        if (!isAuthenticated || isPublicStatusRoute) return;

        fetchMonitors();

        // Connect to SSE for real-time updates
        const url = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/monitors/stream` : '/api/monitors/stream';
        const sse = new EventSource(url, { withCredentials: true });

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
    }, [isAuthenticated, isPublicStatusRoute, fetchMonitors, handleSSEUpdate]);

    if (isPublicStatusRoute) {
        return <PublicStatusPage />;
    }

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
                <h1 data-testid="app-title">Ping Agent</h1>
                <div className="header-actions">
                    <span className="header-user">
                        {user?.username} ({user?.role})
                    </span>
                    {isAdmin && (
                        <>
                            <Link to="/settings" className="btn btn-secondary" style={{ textDecoration: 'none' }} data-testid="nav-settings">
                                ⚙️ Settings
                            </Link>
                            <Link to="/users" className="btn btn-secondary" style={{ textDecoration: 'none' }} data-testid="nav-users">
                                👥 Users
                            </Link>
                            <Link to="/audit" className="btn btn-secondary" style={{ textDecoration: 'none' }} data-testid="nav-audit">
                                📋 Audit Log
                            </Link>
                            <Link to="/agents" className="btn btn-secondary" style={{ textDecoration: 'none' }} data-testid="nav-agents">
                                🛰 Agents
                            </Link>
                            <Link to="/status" className="btn btn-secondary" style={{ textDecoration: 'none' }} data-testid="nav-public-status">
                                🌐 Public Status
                            </Link>
                        </>
                    )}
                    <button className="btn btn-secondary" onClick={logout} data-testid="logout-button">
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
                        onTogglePublicVisibility={togglePublicVisibility}
                    />
                } />

                <Route path="/users" element={
                    isAdmin ? (
                        <div>
                            <div className="app-header" style={{ marginTop: 24, padding: 0 }}>
                                <h1 data-testid="users-page-title">👥 User Management</h1>
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
                                <h1 data-testid="audit-page-title">📋 Audit Log</h1>
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
                                <h1 data-testid="agents-page-title">🛰 Agents</h1>
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
