import { describe, expect, it } from 'vitest';
import { readAgentEnv } from '../src/config';

describe('agent config', () => {
    it('reads required env values and applies defaults', () => {
        const env = readAgentEnv({
            MAIN_SERVER_URL: 'https://uptime.example.test/',
            AGENT_TOKEN: 'agent-token',
        });

        expect(env).toMatchObject({
            mainServerUrl: 'https://uptime.example.test',
            agentToken: 'agent-token',
            httpTimeoutMs: 7000,
            bufferMax: 200,
            resultMaxBatch: 50,
            maxConcurrency: 6,
            allowPrivateMonitorTargets: false,
            encryptionKeysByVersion: {},
            fallbackEncryptionKey: null,
        });
    });

    it('reads tuning values and private-target flag', () => {
        const env = readAgentEnv({
            MAIN_SERVER_URL: 'https://uptime.example.test',
            AGENT_TOKEN: 'agent-token',
            AGENT_HTTP_TIMEOUT_MS: '10000',
            AGENT_BUFFER_MAX: '1000',
            AGENT_RESULT_MAX_BATCH: '500',
            AGENT_MAX_CONCURRENCY: '12',
            ALLOW_PRIVATE_MONITOR_TARGETS: 'true',
        });

        expect(env.httpTimeoutMs).toBe(10000);
        expect(env.bufferMax).toBe(1000);
        expect(env.resultMaxBatch).toBe(500);
        expect(env.maxConcurrency).toBe(12);
        expect(env.allowPrivateMonitorTargets).toBe(true);
    });

    it('reads versioned and fallback encryption keys', () => {
        const env = readAgentEnv({
            MAIN_SERVER_URL: 'https://uptime.example.test',
            AGENT_TOKEN: 'agent-token',
            ENCRYPTION_KEY: 'a'.repeat(64),
            ENCRYPTION_KEY_2: 'b'.repeat(64),
        });

        expect(env.fallbackEncryptionKey).toBe('a'.repeat(64));
        expect(env.encryptionKeysByVersion).toEqual({ 2: 'b'.repeat(64) });
    });

    it('rejects malformed encryption keys', () => {
        expect(() => readAgentEnv({
            MAIN_SERVER_URL: 'https://uptime.example.test',
            AGENT_TOKEN: 'agent-token',
            ENCRYPTION_KEY_1: 'not-hex',
        })).toThrow('ENCRYPTION_KEY_1 must be a 64-character hex string');
    });

    it('requires main server URL and agent token', () => {
        expect(() => readAgentEnv({
            AGENT_TOKEN: 'agent-token',
        })).toThrow();

        expect(() => readAgentEnv({
            MAIN_SERVER_URL: 'https://uptime.example.test',
        })).toThrow();
    });
});
