import { useEffect, useState } from 'react';
import { Agent, agentsApi } from '../api';

const CURRENT_AGENT_VERSION = '1.0.0';
const GEO_CITY_LABELS: Record<string, string> = {
    "Kazan'": 'Казань',
    'Moscow': 'Москва',
    'Saint Petersburg': 'Санкт-Петербург',
    'Yekaterinburg': 'Екатеринбург',
    'Novosibirsk': 'Новосибирск',
    'Nizhniy Novgorod': 'Нижний Новгород',
    'Yuzhno-Sakhalinsk': 'Южно-Сахалинск',
};

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

function formatAgentCity(city: string | null): string | null {
    if (!city) {
        return null;
    }

    return GEO_CITY_LABELS[city] || city.replace(/'+/g, '').trim() || null;
}

function formatAgentLocation(agent: Agent): string {
    const countryName = agent.lastSeenCountry
        ? new Intl.DisplayNames(['ru', 'en'], { type: 'region' }).of(agent.lastSeenCountry) || agent.lastSeenCountry
        : null;
    const parts = [countryName, formatAgentCity(agent.lastSeenCity)].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Unknown location';
}

function getAgentAttentionFlags(agent: Agent) {
    const versionState = getAgentVersionState(agent.agentVersion);
    const isOnline = agent.status === 'ONLINE';

    return {
        isOnline,
        isRevoked: Boolean(agent.revokedAt),
        isOutdated: versionState === 'OUTDATED',
        versionState,
        needsAttention: !isOnline || Boolean(agent.revokedAt) || versionState === 'OUTDATED',
    };
}

function getAgentPriority(agent: Agent): number {
    const flags = getAgentAttentionFlags(agent);
    if (flags.isRevoked) return 0;
    if (!flags.isOnline) return 1;
    if (flags.isOutdated) return 2;
    return 3;
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
    const sortedAgents = [...agents].sort((left, right) => {
        const priorityDiff = getAgentPriority(left) - getAgentPriority(right);
        if (priorityDiff !== 0) {
            return priorityDiff;
        }

        return new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime();
    });
    const agentSummary = sortedAgents.reduce((acc, agent) => {
        const flags = getAgentAttentionFlags(agent);
        acc.total += 1;
        if (flags.isOnline) acc.online += 1;
        if (flags.isOutdated) acc.outdated += 1;
        if (flags.needsAttention) acc.attention += 1;
        return acc;
    }, { total: 0, online: 0, outdated: 0, attention: 0 });

    const envSnippet = createdToken
        ? `MAIN_SERVER_URL=${defaultServerUrl || 'https://your-uptime-host.example.com'}
AGENT_TOKEN=${createdToken}
ENCRYPTION_KEY_1=<same-64-hex-key-as-control-plane>
AGENT_DEPLOYMENT_MODE=local-build`
        : '';

    const installScriptSnippet = createdToken
        ? `git clone https://github.com/kursov-git/uptime-monitor-v2.git
cd uptime-monitor-v2
sudo MAIN_SERVER_URL="${defaultServerUrl || 'https://your-uptime-host.example.com'}" \\
AGENT_TOKEN="${createdToken}" \\
ENCRYPTION_KEY_1="<same-64-hex-key-as-control-plane>" \\
AGENT_DEPLOYMENT_MODE="local-build" \\
bash scripts/install-agent.sh`
        : '';

    const systemdSnippet = createdToken
        ? `sudo install -d -m 0755 /opt/uptime-agent
sudo tee /opt/uptime-agent/.env >/dev/null <<'EOF'
MAIN_SERVER_URL=${defaultServerUrl || 'https://your-uptime-host.example.com'}
AGENT_TOKEN=${createdToken}
ENCRYPTION_KEY_1=<same-64-hex-key-as-control-plane>
AGENT_DEPLOYMENT_MODE=local-build
EOF

sudo bash scripts/install-agent.sh`
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
  registry.example.com/uptime-agent:tag`
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
        <div className="agents-page">
            <div className="dashboard-toolbar">
                <div className="dashboard-toolbar-copy">
                    <h2 data-testid="agents-page-title">Agents</h2>
                    <p>Register runtimes, issue tokens, and watch fleet health from one control surface.</p>
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="dashboard-summary-cards">
                <div className="dashboard-summary-card">
                    <span>Registered</span>
                    <strong data-testid="agent-summary-total">{agentSummary.total}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Online</span>
                    <strong data-testid="agent-summary-online">{agentSummary.online}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Needs Attention</span>
                    <strong data-testid="agent-summary-attention">{agentSummary.attention}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Outdated</span>
                    <strong data-testid="agent-summary-outdated">{agentSummary.outdated}</strong>
                </div>
            </div>

            <div className={`agents-top-grid ${createdToken ? 'with-issued' : ''}`}>
                <section className="agents-section-card">
                    <div className="agents-section-header">
                        <div>
                            <h3>Register Agent</h3>
                            <p>Issue a one-time registration token, then configure the real host and restart its service.</p>
                        </div>
                    </div>

                    <div className="warning-message">
                        This page issues agent credentials only. Deployment remains manual: put the token into the agent environment,
                        point it to the server URL, then restart the agent service.
                    </div>

                    <form onSubmit={registerAgent} className="agents-register-form">
                        <div className="form-group">
                            <label>Agent Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Agent name (e.g. us-east-1)"
                                required
                            />
                        </div>
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
                        <div className="agents-register-actions">
                            <button type="submit" className="btn btn-primary">Register Agent</button>
                        </div>
                    </form>
                </section>

                {createdToken && (
                    <section className="agents-section-card agents-issued-panel">
                        <div className="agents-section-header">
                            <div>
                                <h3>Issued Token</h3>
                                <p>One-time registration material{registrationName ? ` for ${registrationName}` : ''}.</p>
                            </div>
                        </div>

                        <div className="agents-issued-token">
                            <strong>Registration token</strong>
                            <code>{createdToken}</code>
                            <p>Next step: deploy or update the real agent process with this token and restart it.</p>
                        </div>

                        <div className="agents-checklist">
                            <div className="agents-checklist-title">Registration Checklist</div>
                            <div className="agents-checklist-items">
                                <div>{issuedAgent ? '✓' : '•'} Registered in control plane</div>
                                <div>{issuedAgent?.status === 'ONLINE' ? '✓' : '•'} Configured on host and service restarted {issuedAgent?.status === 'ONLINE' ? '(inferred from heartbeat)' : '(manual step pending)'}</div>
                                <div>{issuedAgent?.status === 'ONLINE' ? '✓' : '•'} Agent connected and sending heartbeat {issuedAgent?.status === 'ONLINE' ? '(online now)' : '(waiting for first heartbeat)'}</div>
                            </div>
                        </div>

                        <div className="agents-snippet-block">
                            <div className="agents-snippet-title">Env snippet</div>
                            <textarea readOnly value={envSnippet} rows={4} className="agents-snippet-textarea" />
                            <div className="agents-copy-row">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => copySnippet(envSnippet, 'Copied env snippet')}>
                                    Copy Env Snippet
                                </button>
                                {copyMessage && <span>{copyMessage}</span>}
                            </div>
                            <div className="agents-snippet-help">
                                Example: update `/etc/uptime-agent.env`, then `systemctl restart uptime-agent`.
                            </div>
                        </div>

                        <div className="agents-snippet-block">
                            <div className="agents-snippet-title">Recommended: install script</div>
                            <textarea readOnly value={installScriptSnippet} rows={7} className="agents-snippet-textarea" />
                            <div className="agents-copy-row">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => copySnippet(installScriptSnippet, 'Copied install command')}>
                                    Copy Install Command
                                </button>
                            </div>
                        </div>

                        <div className="agents-snippet-block">
                            <div className="agents-snippet-title">Alternative: systemd + docker compose</div>
                            <textarea readOnly value={systemdSnippet} rows={12} className="agents-snippet-textarea" />
                            <div className="agents-copy-row">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => copySnippet(systemdSnippet, 'Copied systemd snippet')}>
                                    Copy Systemd Snippet
                                </button>
                            </div>
                        </div>

                        <div className="agents-snippet-block">
                            <div className="agents-snippet-title">Alternative: plain docker run</div>
                            <textarea readOnly value={dockerRunSnippet} rows={14} className="agents-snippet-textarea" />
                            <div className="agents-copy-row">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => copySnippet(dockerRunSnippet, 'Copied docker run snippet')}>
                                    Copy Docker Run
                                </button>
                            </div>
                        </div>
                    </section>
                )}
            </div>

            {loading ? (
                <div className="empty-state"><h3>Loading registered agents...</h3></div>
            ) : agents.length === 0 ? (
                <div className="empty-state"><h3>No registered agents yet</h3></div>
            ) : (
                <div className="agents-list">
                    {sortedAgents.map((agent) => {
                        const flags = getAgentAttentionFlags(agent);
                        const monitorsAssigned = agent._count?.monitors ?? 0;
                        return (
                            <article className={`card agent-card ${flags.needsAttention ? 'needs-attention' : ''}`} key={agent.id}>
                                <div className="agent-card-main">
                                    <div className="agent-card-header">
                                        <div className="agent-card-title">
                                            <h3>{agent.name}</h3>
                                            <p>ID: {agent.id}</p>
                                        </div>
                                        <div className="agent-card-badges">
                                            <span className={`status-badge ${flags.isOnline ? 'up' : 'down'}`}>
                                                {flags.isOnline ? 'ONLINE' : agent.status}
                                            </span>
                                            {flags.isOutdated && (
                                                <span className="status-badge flapping">Update needed</span>
                                            )}
                                            {flags.isRevoked && (
                                                <span className="status-badge down">Access revoked</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="agent-card-meta">
                                        <div className="agent-meta-item">
                                            <span>Last heartbeat</span>
                                            <strong>{new Date(agent.lastSeen).toLocaleString()}</strong>
                                        </div>
                                        <div className="agent-meta-item">
                                            <span>IP</span>
                                            <strong>{agent.lastSeenIp || 'Unknown IP'}</strong>
                                        </div>
                                        <div className="agent-meta-item">
                                            <span>Geo</span>
                                            <strong>{formatAgentLocation(agent)}</strong>
                                        </div>
                                        <div className="agent-meta-item">
                                            <span>Agent version</span>
                                            <strong className={flags.isOutdated ? 'agent-meta-warning' : undefined}>{getAgentVersionLabel(agent.agentVersion)}</strong>
                                        </div>
                                        <div className="agent-meta-item">
                                            <span>Assigned monitors</span>
                                            <strong>{monitorsAssigned}</strong>
                                        </div>
                                    </div>

                                    <div className="agent-settings-panel">
                                        <div className="agent-settings-title">Runtime thresholds</div>
                                        <div className="form-row">
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
                                </div>

                                <div className="agent-card-side">
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
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
