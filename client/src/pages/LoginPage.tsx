import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(username, password);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-shell">
            <div className="login-shell-grid">
                <section className="login-hero-card">
                    <div className="public-status-kicker">Ping Agent</div>
                    <h1 data-testid="login-title">Calm operator access for uptime and agent health.</h1>
                    <p className="login-subtitle">
                        Sign in to manage monitors, review agent activity, inspect history, and operate the control plane from one place.
                    </p>
                    <div className="login-meta-grid">
                        <div className="login-meta-card">
                            <span>Monitoring</span>
                            <strong>HTTP, TCP, DNS, SSL</strong>
                        </div>
                        <div className="login-meta-card">
                            <span>Execution</span>
                            <strong>Builtin worker + remote agents</strong>
                        </div>
                        <div className="login-meta-card">
                            <span>Public surface</span>
                            <strong>Readable status page and drill-down</strong>
                        </div>
                    </div>
                </section>

                <section className="login-form-card">
                    <div className="app-modal-kicker">Operator Sign In</div>
                    <h2>Ping Agent</h2>
                    <p className="login-form-subtitle">Use your operator credentials to continue.</p>

                    {error && <div className="error-message">{error}</div>}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Username</label>
                            <input
                                id="username"
                                data-testid="login-username"
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="admin"
                                required
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label>Password</label>
                            <input
                                id="password"
                                data-testid="login-password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary login-submit-button"
                            disabled={loading}
                            data-testid="login-submit"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
}
