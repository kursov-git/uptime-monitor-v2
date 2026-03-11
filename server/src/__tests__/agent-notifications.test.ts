import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { initApp } from '../index';
import prisma from '../lib/prisma';
import { hashAgentToken } from '../services/agentAuth';
import { FlappingService } from '../services/flapping';
import { AgentOfflineMonitorService } from '../services/agentOfflineMonitor';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

let app: FastifyInstance;

beforeAll(async () => {
    app = await initApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

beforeEach(async () => {
    await prisma.notificationHistory.deleteMany();
    await prisma.monitorNotificationOverride.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.notificationSettings.deleteMany();
    await prisma.auditLog.deleteMany();
    (FlappingService as any).states = new Map();
    vi.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { ok: true, result: 'success' } });

    await prisma.notificationSettings.create({
        data: {
            appBaseUrl: 'https://uptime.example.com',
            flappingFailCount: 1,
            flappingIntervalSec: 300,
            telegramEnabled: true,
            telegramBotToken: 'test-bot-token',
            telegramChatId: '12345',
        },
    });
});

describe('Agent notification flows', () => {
    it('sends monitor down notifications for results posted by a remote agent', async () => {
        const rawToken = 'remote-agent-token';
        const agent = await prisma.agent.create({
            data: {
                name: 'ruvdskzn',
                tokenHash: hashAgentToken(rawToken),
            },
        });

        const monitor = await prisma.monitor.create({
            data: {
                name: 'Remote API',
                url: 'https://remote.example.com/health',
                agentId: agent.id,
            },
        });

        const response = await app.inject({
            method: 'POST',
            url: '/api/agent/results',
            headers: {
                Authorization: `Bearer ${rawToken}`,
            },
            payload: {
                results: [{
                    idempotencyKey: 'remote-result-1',
                    monitorId: monitor.id,
                    isUp: false,
                    responseTimeMs: 412,
                    statusCode: 503,
                    error: 'Expected status 200, got 503',
                }],
            },
        });

        expect(response.statusCode).toBe(200);
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('Check source: ruvdskzn');
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('HTTP status: 503');
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('/monitors/');

        const history = await prisma.notificationHistory.findMany({
            where: { monitorId: monitor.id },
        });
        expect(history).toHaveLength(1);
        expect(history[0].channel).toBe('TELEGRAM');
        expect(history[0].status).toBe('SUCCESS');
    });

    it('sends an OFFLINE notification when an agent becomes stale', async () => {
        const staleAgent = await prisma.agent.create({
            data: {
                name: 'cloudruvm1',
                tokenHash: 'cloudruvm1-token-hash',
                status: 'ONLINE',
                lastSeen: new Date('2026-03-11T06:00:00.000Z'),
                offlineAfterSec: 90,
            },
        });

        await prisma.monitor.create({
            data: {
                name: 'Cloud API',
                url: 'https://cloud.example.com/health',
                agentId: staleAgent.id,
            },
        });

        const service = new AgentOfflineMonitorService();
        const changed = await service.tick(new Date('2026-03-11T06:05:00.000Z'));

        expect(changed).toBe(1);
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('cloudruvm1');
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('Assigned monitors: 1');
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('/agents');

        const updatedAgent = await prisma.agent.findUniqueOrThrow({ where: { id: staleAgent.id } });
        expect(updatedAgent.status).toBe('OFFLINE');

        const history = await prisma.notificationHistory.findMany({
            where: { monitorId: null },
        });
        expect(history).toHaveLength(1);
        expect(history[0].channel).toBe('TELEGRAM');
        expect(history[0].status).toBe('SUCCESS');
    });
});
