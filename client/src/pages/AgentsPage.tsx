import { useEffect, useState } from 'react';
import { Agent, agentsApi } from '../api';

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const [heartbeatIntervalSec, setHeartbeatIntervalSec] = useState(30);
    const [offlineAfterSec, setOfflineAfterSec] = useState(90);
    const [createdToken, setCreatedToken] = useState('');

    const fetchAgents = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await agentsApi.get<Agent[]>('/');
            setAgents(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to load agents');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgents();
    }, []);

    const createAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setCreatedToken('');
        try {
            const res = await agentsApi.post('/', { name, heartbeatIntervalSec, offlineAfterSec });
            setCreatedToken(res.data.token || '');
            setName('');
            await fetchAgents();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to create agent');
        }
    };

    const rotateToken = async (id: string) => {
        setError('');
        setCreatedToken('');
        try {
            const res = await agentsApi.post(`/${id}/rotate-token`);
            setCreatedToken(res.data.token || '');
            await fetchAgents();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to rotate token');
        }
    };

    const revokeAgent = async (id: string) => {
        if (!confirm('Revoke this agent token?')) return;
        setError('');
        try {
            await agentsApi.post(`/${id}/revoke`);
            await fetchAgents();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to revoke agent');
        }
    };

    const updateAgent = async (agent: Agent) => {
        setError('');
        try {
            await agentsApi.patch(`/${agent.id}`, {
                heartbeatIntervalSec: agent.heartbeatIntervalSec,
                offlineAfterSec: agent.offlineAfterSec,
            });
            await fetchAgents();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to update agent');
        }
    };

    return (
        <div className="card">
            <h2 style={{ marginBottom: 12 }}>Agents</h2>

            {error && <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>}
            {createdToken && (
                <div className="warning-message" style={{ marginBottom: 12 }}>
                    <strong>One-time token:</strong>
                    <code style={{ display: 'block', marginTop: 8, wordBreak: 'break-all' }}>{createdToken}</code>
                </div>
            )}

            <form onSubmit={createAgent} style={{ marginBottom: 16, display: 'grid', gap: 8 }}>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Agent name (e.g. us-east-1)"
                    required
                />
                <div className="form-row">
                    <div className="form-group">
                        <label>Heartbeat sec</label>
                        <input
                            type="number"
                            min={5}
                            max={600}
                            value={heartbeatIntervalSec}
                            onChange={(e) => setHeartbeatIntervalSec(parseInt(e.target.value, 10))}
                        />
                    </div>
                    <div className="form-group">
                        <label>Offline after sec</label>
                        <input
                            type="number"
                            min={10}
                            max={3600}
                            value={offlineAfterSec}
                            onChange={(e) => setOfflineAfterSec(parseInt(e.target.value, 10))}
                        />
                    </div>
                </div>
                <div>
                    <button type="submit" className="btn btn-primary">Create Agent</button>
                </div>
            </form>

            {loading ? (
                <div className="empty-state"><h3>Loading agents...</h3></div>
            ) : agents.length === 0 ? (
                <div className="empty-state"><h3>No agents yet</h3></div>
            ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {agents.map((agent) => (
                        <div className="card" key={agent.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div>
                                    <div style={{ fontWeight: 700 }}>{agent.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>ID: {agent.id}</div>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                        Status: <strong>{agent.status}</strong> | lastSeen: {new Date(agent.lastSeen).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                        Monitors: {agent._count?.monitors ?? 0}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => rotateToken(agent.id)}>Rotate Token</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => revokeAgent(agent.id)}>Revoke</button>
                                </div>
                            </div>

                            <div className="form-row" style={{ marginTop: 10 }}>
                                <div className="form-group">
                                    <label>Heartbeat sec</label>
                                    <input
                                        type="number"
                                        min={5}
                                        max={600}
                                        value={agent.heartbeatIntervalSec}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, heartbeatIntervalSec: v } : a));
                                        }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Offline after sec</label>
                                    <input
                                        type="number"
                                        min={10}
                                        max={3600}
                                        value={agent.offlineAfterSec}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, offlineAfterSec: v } : a));
                                        }}
                                    />
                                </div>
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={() => updateAgent(agent)}>
                                Save Settings
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
