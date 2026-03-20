import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
            <div className="app-header">
                <div className="app-shell-brand">
                    <div className="app-shell-kicker">Control Plane</div>
                    <h1 data-testid="app-title">Ping Agent</h1>
                </div>
                <div className="app-shell-meta">
                    <span className="header-user">
                        {user?.username} · {user?.role}
                    </span>
                    <button className="btn btn-secondary btn-sm" onClick={logout} data-testid="logout-button">
                        Logout
                    </button>
                </div>
            </div>

            <div className="app-nav">
                <NavLink to="/" end className={({ isActive }: { isActive: boolean }) => `app-nav-link${isActive ? ' active' : ''}`}>
                    Monitors
                </NavLink>
                {isAdmin && (
                    <>
                        <NavLink to="/agents" className={({ isActive }: { isActive: boolean }) => `app-nav-link${isActive ? ' active' : ''}`} data-testid="nav-agents">
                            Agents
                        </NavLink>
                        <NavLink to="/settings" className={({ isActive }: { isActive: boolean }) => `app-nav-link${isActive ? ' active' : ''}`} data-testid="nav-settings">
                            Settings
                        </NavLink>
                        <NavLink to="/settings/history" className={({ isActive }: { isActive: boolean }) => `app-nav-link${isActive ? ' active' : ''}`}>
                            Notification History
                        </NavLink>
                        <NavLink to="/users" className={({ isActive }: { isActive: boolean }) => `app-nav-link${isActive ? ' active' : ''}`} data-testid="nav-users">
                            Users
                        </NavLink>
                        <NavLink to="/audit" className={({ isActive }: { isActive: boolean }) => `app-nav-link${isActive ? ' active' : ''}`} data-testid="nav-audit">
                            Audit
                        </NavLink>
                        <NavLink to="/status" className={({ isActive }: { isActive: boolean }) => `app-nav-link${isActive ? ' active' : ''}`} data-testid="nav-public-status">
                            Public Status
                        </NavLink>
                    </>
                )}
            </div>

            <div className="app-shell-body">
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
                            <UsersPage />
                        ) : (
                            <div className="empty-state"><h3>Unauthorized</h3></div>
                        )
                    } />

                    <Route path="/audit" element={
                        isAdmin ? (
                            <AuditLogPage />
                        ) : (
                            <div className="empty-state"><h3>Unauthorized</h3></div>
                        )
                    } />

                    <Route path="/settings" element={
                        isAdmin ? (
                            <NotificationSettings />
                        ) : (
                            <div className="empty-state"><h3>Unauthorized</h3></div>
                        )
                    } />

                    <Route path="/settings/history" element={
                        isAdmin ? (
                            <NotificationHistoryPage />
                        ) : (
                            <div className="empty-state"><h3>Unauthorized</h3></div>
                        )
                    } />

                    <Route path="/agents" element={
                        isAdmin ? (
                            <AgentsPage />
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
        </div>
    );
}
