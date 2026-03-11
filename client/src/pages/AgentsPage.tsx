import { useEffect, useState } from 'react';
import { Agent, agentsApi } from '../api';

const CURRENT_AGENT_VERSION = '1.0.0';

function getAgentVersionState(version: string | null): 'CURRENT' | 'OUTDATED' | 'UNKNOWN' {
    if (!version) return 'UNKNOWN';
    return version === CURRENT_AGENT_VERSION ? 'CURRENT' : 'OUTDATED';
}

function getAgentVersionLabel(version: string | null): string {
    const state = getAgentVersionState(version);
    if (state === 'UNKNOWN') return 'unknown';
    if (state === 'OUTDATED') return `${version} (expected ${CURRENT_AGENT_VERSION})`;
    return version || CURRENT_AGENT_VERSION;
}

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const [heartbeatIntervalSec, setHeartbeatIntervalSec] = useState(30);
    const [offlineAfterSec, setOfflineAfterSec] = useState(90);
    const [createdToken, setCreatedToken] = useState('');
    const [registrationName, setRegistrationName] = useState('');
    const [registrationAgentId, setRegistrationAgentId] = useState('');
    const [copyMessage, setCopyMessage] = useState('');

    const defaultServerUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const defaultAgentImage = 'ghcr.io/kursov-git/uptime-agent:v2-latest';

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

    const registerAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setCreatedToken('');
        setRegistrationName('');
        setRegistrationAgentId('');
        setCopyMessage('');
        try {
            const res = await agentsApi.post('/', { name, heartbeatIntervalSec, offlineAfterSec });
            setCreatedToken(res.data.token || '');
            setRegistrationName(res.data.agent?.name || name);
            setRegistrationAgentId(res.data.agent?.id || '');
            setName('');
            await fetchAgents();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to register agent');
        }
    };

    const rotateToken = async (id: string) => {
        setError('');
        setCreatedToken('');
        setRegistrationName('');
        setRegistrationAgentId('');
        setCopyMessage('');
        try {
            const res = await agentsApi.post(`/${id}/rotate-token`);
            setCreatedToken(res.data.token || '');
            const agent = agents.find((entry) => entry.id === id);
            setRegistrationName(agent?.name || '');
            setRegistrationAgentId(id);
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

    const deleteAgent = async (agent: Agent) => {
        if (!confirm(`Delete agent "${agent.name}" from the control plane? This keeps historical results but removes the agent record and token.`)) {
            return;
        }

        setError('');
        try {
            await agentsApi.delete(`/${agent.id}`);
            if (registrationAgentId === agent.id) {
                setCreatedToken('');
                setRegistrationName('');
                setRegistrationAgentId('');
                setCopyMessage('');
            }
            await fetchAgents();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to delete agent');
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

    const issuedAgent = registrationAgentId
        ? agents.find((entry) => entry.id === registrationAgentId) || null
        : null;

    const envSnippet = createdToken
        ? `MAIN_SERVER_URL=${defaultServerUrl || 'https://your-uptime-host.example.com'}
AGENT_TOKEN=${createdToken}
ENCRYPTION_KEY_1=<same-64-hex-key-as-control-plane>
UPTIME_AGENT_IMAGE=${defaultAgentImage}`
        : '';

    const installScriptSnippet = createdToken
        ? `curl -fsSL https://raw.githubusercontent.com/kursov-git/uptime-monitor/main/scripts/install-agent.sh -o /tmp/install-agent.sh
chmod +x /tmp/install-agent.sh
sudo MAIN_SERVER_URL="${defaultServerUrl || 'https://your-uptime-host.example.com'}" \\
AGENT_TOKEN="${createdToken}" \\
ENCRYPTION_KEY_1="<same-64-hex-key-as-control-plane>" \\
UPTIME_AGENT_IMAGE="${defaultAgentImage}" \\
bash /tmp/install-agent.sh`
        : '';

    const systemdSnippet = createdToken
        ? `sudo install -d -m 0755 /opt/uptime-agent
sudo tee /opt/uptime-agent/.env >/dev/null <<'EOF'
MAIN_SERVER_URL=${defaultServerUrl || 'https://your-uptime-host.example.com'}
AGENT_TOKEN=${createdToken}
ENCRYPTION_KEY_1=<same-64-hex-key-as-control-plane>
UPTIME_AGENT_IMAGE=${defaultAgentImage}
EOF

sudo cp deployment/agent/docker-compose.agent.yml /opt/uptime-agent/docker-compose.yml
sudo cp deployment/agent/uptime-agent.service /etc/systemd/system/uptime-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now uptime-agent`
        : '';

    const dockerRunSnippet = createdToken
        ? `docker run -d \\
  --name uptime-agent \\
  --restart unless-stopped \\
  --read-only \\
  --tmpfs /tmp:size=64m,noexec,nosuid,nodev \\
  --pids-limit 128 \\
  --memory 256m \\
  --cpus 0.50 \\
  --cap-drop ALL \\
  --security-opt no-new-privileges:true \\
  -e MAIN_SERVER_URL=${defaultServerUrl || 'https://your-uptime-host.example.com'} \\
  -e AGENT_TOKEN=${createdToken} \\
  -e ENCRYPTION_KEY_1=<same-64-hex-key-as-control-plane> \\
  -e AGENT_HTTP_TIMEOUT_MS=10000 \\
  -e AGENT_BUFFER_MAX=1000 \\
  -e AGENT_RESULT_MAX_BATCH=500 \\
  ${defaultAgentImage}`
        : '';

    const copySnippet = async (value: string, successLabel: string) => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopyMessage(successLabel);
        } catch {
            setCopyMessage('Copy failed');
        }
    };

    return (
        <div className="card">
            <h2 style={{ marginBottom: 12 }}>Agents</h2>

            <div className="warning-message" style={{ marginBottom: 12 }}>
                This page registers agent credentials only. Deployment is still manual: put the token into the agent
                environment, point it to the server URL, then restart the agent service.
            </div>

            {error && <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>}
            {createdToken && (
                <div className="warning-message" style={{ marginBottom: 12 }}>
                    <strong>One-time registration token{registrationName ? ` for ${registrationName}` : ''}:</strong>
                    <code style={{ display: 'block', marginTop: 8, wordBreak: 'break-all' }}>{createdToken}</code>
                    <div style={{ marginTop: 12, fontSize: 14 }}>
                        Next step: deploy or update the real agent process with this token and restart it.
                    </div>
                    <div
                        style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 8,
                            background: 'rgba(15, 23, 42, 0.35)',
                            color: 'inherit',
                        }}
                    >
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Registration Checklist</div>
                        <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                            <div>{issuedAgent ? '✓' : '•'} Registered in control plane</div>
                            <div>{issuedAgent?.status === 'ONLINE' ? '✓' : '•'} Configured on host and service restarted {issuedAgent?.status === 'ONLINE' ? '(inferred from agent heartbeat)' : '(manual step pending)'}</div>
                            <div>{issuedAgent?.status === 'ONLINE' ? '✓' : '•'} Agent connected and sending heartbeat {issuedAgent?.status === 'ONLINE' ? '(online now)' : '(waiting for first heartbeat)'}</div>
                        </div>
                    </div>
                    <textarea
                        readOnly
                        value={envSnippet}
                        rows={4}
                        style={{
                            width: '100%',
                            marginTop: 8,
                            resize: 'vertical',
                            fontFamily: 'monospace',
                            fontSize: 13,
                        }}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => copySnippet(envSnippet, 'Copied env snippet')}>
                            Copy Env Snippet
                        </button>
                        {copyMessage && (
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{copyMessage}</span>
                        )}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Example: update `/etc/uptime-agent.env`, then `systemctl restart uptime-agent`.
                    </div>

                    <div style={{ marginTop: 16, fontWeight: 700 }}>Recommended: install script</div>
                    <textarea
                        readOnly
                        value={installScriptSnippet}
                        rows={7}
                        style={{
                            width: '100%',
                            marginTop: 8,
                            resize: 'vertical',
                            fontFamily: 'monospace',
                            fontSize: 13,
                        }}
                    />
                    <div style={{ marginTop: 8 }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => copySnippet(installScriptSnippet, 'Copied install command')}
                        >
                            Copy Install Command
                        </button>
                    </div>

                    <div style={{ marginTop: 16, fontWeight: 700 }}>Alternative: systemd + docker compose</div>
                    <textarea
                        readOnly
                        value={systemdSnippet}
                        rows={12}
                        style={{
                            width: '100%',
                            marginTop: 8,
                            resize: 'vertical',
                            fontFamily: 'monospace',
                            fontSize: 13,
                        }}
                    />
                    <div style={{ marginTop: 8 }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => copySnippet(systemdSnippet, 'Copied systemd snippet')}
                        >
                            Copy Systemd Snippet
                        </button>
                    </div>

                    <div style={{ marginTop: 16, fontWeight: 700 }}>Alternative: plain docker run</div>
                    <textarea
                        readOnly
                        value={dockerRunSnippet}
                        rows={14}
                        style={{
                            width: '100%',
                            marginTop: 8,
                            resize: 'vertical',
                            fontFamily: 'monospace',
                            fontSize: 13,
                        }}
                    />
                    <div style={{ marginTop: 8 }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => copySnippet(dockerRunSnippet, 'Copied docker run snippet')}
                        >
                            Copy Docker Run
                        </button>
                    </div>
                </div>
            )}

            <form onSubmit={registerAgent} style={{ marginBottom: 16, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Register Agent</div>
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
                    <button type="submit" className="btn btn-primary">Register Agent</button>
                </div>
            </form>

            {loading ? (
                <div className="empty-state"><h3>Loading registered agents...</h3></div>
            ) : agents.length === 0 ? (
                <div className="empty-state"><h3>No registered agents yet</h3></div>
            ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {agents.map((agent) => {
                        const versionState = getAgentVersionState(agent.agentVersion);
                        const monitorsAssigned = agent._count?.monitors ?? 0;
                        return (
                        <div className="card" key={agent.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div>
                                    <div style={{ fontWeight: 700 }}>{agent.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>ID: {agent.id}</div>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                        Status: <strong>{agent.status}</strong> | lastSeen: {new Date(agent.lastSeen).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: 12, color: versionState === 'OUTDATED' ? '#f59e0b' : 'var(--color-text-secondary)' }}>
                                        Agent version: <strong>{getAgentVersionLabel(agent.agentVersion)}</strong>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                        Monitors: {monitorsAssigned}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => rotateToken(agent.id)}>Rotate Agent Token</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => revokeAgent(agent.id)}>Revoke Access</button>
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => deleteAgent(agent)}
                                        disabled={monitorsAssigned > 0}
                                        title={monitorsAssigned > 0 ? 'Unassign monitors before deleting this agent' : 'Delete agent record'}
                                    >
                                        Delete Agent
                                    </button>
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
                        );
                    })}
                </div>
            )}
        </div>
    );
}
