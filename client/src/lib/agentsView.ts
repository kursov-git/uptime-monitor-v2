import type { Agent } from '../api';
import { getApiErrorMessage } from './apiErrors';

export const CURRENT_AGENT_VERSION = '1.0.0';

const GEO_CITY_LABELS: Record<string, string> = {
    "Kazan'": 'Казань',
    Moscow: 'Москва',
    'Saint Petersburg': 'Санкт-Петербург',
    Yekaterinburg: 'Екатеринбург',
    Novosibirsk: 'Новосибирск',
    'Nizhniy Novgorod': 'Нижний Новгород',
    'Yuzhno-Sakhalinsk': 'Южно-Сахалинск',
};

export interface AgentAttentionFlags {
    isOnline: boolean;
    isRevoked: boolean;
    isOutdated: boolean;
    versionState: 'CURRENT' | 'OUTDATED' | 'UNKNOWN';
    needsAttention: boolean;
}

export interface AgentSummary {
    total: number;
    online: number;
    outdated: number;
    attention: number;
}

export function getAgentVersionState(version: string | null): AgentAttentionFlags['versionState'] {
    if (!version) return 'UNKNOWN';
    return version === CURRENT_AGENT_VERSION ? 'CURRENT' : 'OUTDATED';
}

export function getAgentVersionLabel(version: string | null): string {
    const state = getAgentVersionState(version);
    if (state === 'UNKNOWN') return 'unknown';
    if (state === 'OUTDATED') return `${version} (expected ${CURRENT_AGENT_VERSION})`;
    return version || CURRENT_AGENT_VERSION;
}

export function formatAgentCity(city: string | null): string | null {
    if (!city) {
        return null;
    }

    return GEO_CITY_LABELS[city] || city.replace(/'+/g, '').trim() || null;
}

export function formatAgentLocation(agent: Agent): string {
    const countryName = agent.lastSeenCountry
        ? new Intl.DisplayNames(['ru', 'en'], { type: 'region' }).of(agent.lastSeenCountry) || agent.lastSeenCountry
        : null;
    const parts = [countryName, formatAgentCity(agent.lastSeenCity)].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Unknown location';
}

export function getAgentAttentionFlags(agent: Agent): AgentAttentionFlags {
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

export function getAgentPriority(agent: Agent): number {
    const flags = getAgentAttentionFlags(agent);
    if (flags.isRevoked) return 0;
    if (!flags.isOnline) return 1;
    if (flags.isOutdated) return 2;
    return 3;
}

export function sortAgentsForAttention(agents: Agent[]): Agent[] {
    return [...agents].sort((left, right) => {
        const priorityDiff = getAgentPriority(left) - getAgentPriority(right);
        if (priorityDiff !== 0) {
            return priorityDiff;
        }

        return new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime();
    });
}

export function summarizeAgents(agents: Agent[]): AgentSummary {
    return agents.reduce((acc, agent) => {
        const flags = getAgentAttentionFlags(agent);
        acc.total += 1;
        if (flags.isOnline) acc.online += 1;
        if (flags.isOutdated) acc.outdated += 1;
        if (flags.needsAttention) acc.attention += 1;
        return acc;
    }, { total: 0, online: 0, outdated: 0, attention: 0 });
}

export function getAgentApiErrorMessage(error: unknown, fallback: string): string {
    return getApiErrorMessage(error, fallback);
}

export function buildAgentEnvSnippet(serverUrl: string, token: string): string {
    return `MAIN_SERVER_URL=${serverUrl || 'https://your-uptime-host.example.com'}
AGENT_TOKEN=${token}
ENCRYPTION_KEY_1=<same-64-hex-ENCRYPTION_KEY-as-control-plane>
AGENT_DEPLOYMENT_MODE=local-build`;
}

export function buildAgentInstallScript(serverUrl: string, token: string): string {
    return `git clone https://github.com/kursov-git/uptime-monitor-v2.git
cd uptime-monitor-v2
sudo MAIN_SERVER_URL="${serverUrl || 'https://your-uptime-host.example.com'}" \\
AGENT_TOKEN="${token}" \\
ENCRYPTION_KEY_1="<same-64-hex-ENCRYPTION_KEY-as-control-plane>" \\
AGENT_DEPLOYMENT_MODE="local-build" \\
bash scripts/install-agent.sh`;
}

export function buildAgentSystemdSnippet(serverUrl: string, token: string): string {
    return `sudo install -d -m 0755 /opt/uptime-agent
sudo tee /opt/uptime-agent/.env >/dev/null <<'EOF'
MAIN_SERVER_URL=${serverUrl || 'https://your-uptime-host.example.com'}
AGENT_TOKEN=${token}
ENCRYPTION_KEY_1=<same-64-hex-ENCRYPTION_KEY-as-control-plane>
AGENT_DEPLOYMENT_MODE=local-build
EOF

sudo bash scripts/install-agent.sh`;
}

export function buildAgentDockerRun(serverUrl: string, token: string): string {
    return `docker run -d \\
  --name uptime-agent \\
  --restart unless-stopped \\
  --read-only \\
  --tmpfs /tmp:size=64m,noexec,nosuid,nodev \\
  --pids-limit 128 \\
  --memory 256m \\
  --cpus 0.50 \\
  --cap-drop ALL \\
  --security-opt no-new-privileges:true \\
  -e MAIN_SERVER_URL=${serverUrl || 'https://your-uptime-host.example.com'} \\
  -e AGENT_TOKEN=${token} \\
  -e ENCRYPTION_KEY_1=<same-64-hex-ENCRYPTION_KEY-as-control-plane> \\
  -e AGENT_HTTP_TIMEOUT_MS=10000 \\
  -e AGENT_BUFFER_MAX=1000 \\
  -e AGENT_RESULT_MAX_BATCH=500 \\
  registry.example.com/uptime-agent:tag`;
}
