import { describe, expect, it } from 'vitest';
import {
    buildAgentDockerRun,
    buildAgentEnvSnippet,
    formatAgentLocation,
    getAgentApiErrorMessage,
    getAgentAttentionFlags,
    getAgentVersionLabel,
    sortAgentsForAttention,
    summarizeAgents,
} from '../lib/agentsView';
import type { Agent } from '../api';

function agent(overrides: Partial<Agent> = {}): Agent {
    return {
        id: 'agent-1',
        name: 'cloudruvm1',
        status: 'ONLINE',
        agentVersion: '1.0.0',
        heartbeatIntervalSec: 30,
        offlineAfterSec: 90,
        lastSeen: '2026-03-12T18:00:00.000Z',
        lastSeenIp: '203.0.113.10',
        lastSeenCountry: 'RU',
        lastSeenCity: 'Moscow',
        revokedAt: null,
        createdAt: '2026-03-12T17:00:00.000Z',
        updatedAt: '2026-03-12T18:00:00.000Z',
        _count: {
            monitors: 1,
        },
        ...overrides,
    };
}

describe('agentsView helpers', () => {
    it('sorts attention-worthy agents before healthy agents', () => {
        const healthy = agent({ id: 'healthy', name: 'healthy', lastSeen: '2026-03-12T18:10:00.000Z' });
        const outdated = agent({ id: 'outdated', name: 'outdated', agentVersion: '0.9.0' });
        const offline = agent({ id: 'offline', name: 'offline', status: 'OFFLINE' });
        const revoked = agent({ id: 'revoked', name: 'revoked', revokedAt: '2026-03-12T18:20:00.000Z' });

        expect(sortAgentsForAttention([healthy, outdated, offline, revoked]).map((entry) => entry.id)).toEqual([
            'revoked',
            'offline',
            'outdated',
            'healthy',
        ]);
    });

    it('summarizes fleet health and version attention', () => {
        const agents = [
            agent({ id: 'current' }),
            agent({ id: 'old', agentVersion: '0.9.0' }),
            agent({ id: 'offline', status: 'OFFLINE' }),
        ];

        expect(summarizeAgents(agents)).toEqual({
            total: 3,
            online: 2,
            outdated: 1,
            attention: 2,
        });
        expect(getAgentAttentionFlags(agents[1])).toEqual(expect.objectContaining({
            isOutdated: true,
            needsAttention: true,
            versionState: 'OUTDATED',
        }));
        expect(getAgentVersionLabel('0.9.0')).toBe('0.9.0 (expected 1.0.0)');
        expect(getAgentVersionLabel(null)).toBe('unknown');
    });

    it('formats geo metadata for known and unknown agent locations', () => {
        expect(formatAgentLocation(agent({
            lastSeenCountry: 'RU',
            lastSeenCity: "Kazan'",
        }))).toMatch(/Россия, Казань|Russia, Казань/);
        expect(formatAgentLocation(agent({
            lastSeenCountry: null,
            lastSeenCity: null,
        }))).toBe('Unknown location');
    });

    it('builds registration snippets from the issued server URL and token', () => {
        expect(buildAgentEnvSnippet('https://status.example.com', 'token-1')).toContain('MAIN_SERVER_URL=https://status.example.com');
        expect(buildAgentEnvSnippet('', 'token-1')).toContain('MAIN_SERVER_URL=https://your-uptime-host.example.com');
        expect(buildAgentDockerRun('https://status.example.com', 'token-1')).toContain('-e AGENT_TOKEN=token-1');
    });

    it('extracts agent API errors without trusting arbitrary thrown values', () => {
        expect(getAgentApiErrorMessage({
            response: { data: { error: 'agent exists' } },
            message: 'fallback',
        }, 'generic')).toBe('agent exists');
        expect(getAgentApiErrorMessage({ message: 'network failed' }, 'generic')).toBe('network failed');
        expect(getAgentApiErrorMessage('boom', 'generic')).toBe('generic');
    });
});
