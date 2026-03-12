import { describe, expect, it } from 'vitest';
import { readServerEnv } from '../lib/env';

describe('readServerEnv', () => {
    it('applies defaults for non-production runtime', () => {
        const env = readServerEnv({
            DATABASE_URL: 'file:./dev.db',
        });

        expect(env.nodeEnv).toBe('development');
        expect(env.port).toBe(3000);
        expect(env.host).toBe('0.0.0.0');
        expect(env.trustProxy).toBe(false);
        expect(env.logFormat).toBe('pretty');
        expect(env.logLevel).toBe('info');
        expect(env.serverRole).toBe('all');
        expect(env.jwtSecret).toBe('development-secret-change-in-production');
    });

    it('requires JWT_SECRET in production', () => {
        expect(() => readServerEnv({
            NODE_ENV: 'production',
            DATABASE_URL: 'file:./prod.db',
        })).toThrow(/JWT_SECRET environment variable is required in production/);
    });

    it('parses booleans and runtime flags centrally', () => {
        const env = readServerEnv({
            NODE_ENV: 'test',
            DATABASE_URL: 'file:./test.db',
            JWT_SECRET: 'secret',
            TRUST_PROXY: '1',
            ENABLE_AGENT_API: 'false',
            AGENT_SSE_ENABLED: '0',
            ENABLE_BUILTIN_WORKER: 'yes',
            ALLOW_PRIVATE_MONITOR_TARGETS: 'true',
            LOG_FORMAT: 'json',
            LOG_LEVEL: 'debug',
            SERVER_ROLE: 'worker',
            CORS_ORIGINS: 'http://a.local, http://b.local',
        });

        expect(env.enableAgentApi).toBe(false);
        expect(env.agentSseEnabled).toBe(false);
        expect(env.enableBuiltinWorker).toBe(true);
        expect(env.allowPrivateMonitorTargets).toBe(true);
        expect(env.trustProxy).toBe(true);
        expect(env.logFormat).toBe('json');
        expect(env.logLevel).toBe('debug');
        expect(env.serverRole).toBe('worker');
        expect(env.corsOrigins).toEqual(['http://a.local', 'http://b.local']);
    });
});
