import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initApp } from '../index';
import prisma from '../lib/prisma';
import { hashAgentToken } from '../services/agentAuth';

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
    await prisma.auditLog.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitorNotificationOverride.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
    await prisma.notificationSettings.deleteMany();
});

describe('Agent API (Integration)', () => {
    it('rejects jobs without valid token and revoked token', async () => {
        const noToken = await app.inject({ method: 'GET', url: '/api/agent/jobs' });
        expect(noToken.statusCode).toBe(401);

        const token = 'revoked-agent-token';
        await prisma.agent.create({
            data: {
                name: 'revoked-agent',
                tokenHash: hashAgentToken(token),
                revokedAt: new Date(),
            },
        });

        const revoked = await app.inject({
            method: 'GET',
            url: '/api/agent/jobs',
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(revoked.statusCode).toBe(403);
    });

    it('returns only assigned jobs for the authenticated agent', async () => {
        const tokenA = 'agent-token-a';
        const tokenB = 'agent-token-b';

        const agentA = await prisma.agent.create({
            data: {
                name: 'agent-a',
                tokenHash: hashAgentToken(tokenA),
                heartbeatIntervalSec: 15,
            },
        });

        const agentB = await prisma.agent.create({
            data: {
                name: 'agent-b',
                tokenHash: hashAgentToken(tokenB),
            },
        });

        const monitorA = await prisma.monitor.create({
            data: {
                name: 'm-a',
                url: 'https://example.com/a',
                agentId: agentA.id,
                intervalSeconds: 10,
                timeoutSeconds: 5,
            },
        });

        await prisma.monitor.create({
            data: {
                name: 'm-b',
                url: 'https://example.com/b',
                agentId: agentB.id,
            },
        });

        await prisma.monitor.create({
            data: {
                name: 'm-local',
                url: 'https://example.com/local',
            },
        });

        const res = await app.inject({
            method: 'GET',
            url: '/api/agent/jobs',
            headers: { Authorization: `Bearer ${tokenA}` },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.heartbeatIntervalSec).toBe(15);
        expect(body.jobs).toHaveLength(1);
        expect(body.jobs[0].monitorId).toBe(monitorA.id);
    });

    it('stores results with idempotency and monitor ownership checks', async () => {
        const token = 'agent-token-results';
        const agent = await prisma.agent.create({
            data: {
                name: 'agent-results',
                tokenHash: hashAgentToken(token),
            },
        });

        const ownMonitor = await prisma.monitor.create({
            data: {
                name: 'own',
                url: 'https://example.com/own',
                agentId: agent.id,
            },
        });

        const foreignMonitor = await prisma.monitor.create({
            data: {
                name: 'foreign',
                url: 'https://example.com/foreign',
            },
        });

        const first = await app.inject({
            method: 'POST',
            url: '/api/agent/results',
            headers: { Authorization: `Bearer ${token}` },
            payload: {
                results: [
                    {
                        idempotencyKey: 'idem-1-abcdef',
                        monitorId: ownMonitor.id,
                        checkedAt: new Date().toISOString(),
                        isUp: true,
                        responseTimeMs: 42,
                        statusCode: 200,
                    },
                    {
                        idempotencyKey: 'idem-2-abcdef',
                        monitorId: foreignMonitor.id,
                        checkedAt: new Date().toISOString(),
                        isUp: false,
                        responseTimeMs: 10,
                        error: 'forbidden monitor',
                    },
                ],
            },
        });

        expect(first.statusCode).toBe(200);
        const firstBody = JSON.parse(first.body);
        expect(firstBody.acceptedCount).toBe(1);
        expect(firstBody.duplicateCount).toBe(0);
        expect(firstBody.failed).toHaveLength(1);

        const second = await app.inject({
            method: 'POST',
            url: '/api/agent/results',
            headers: { Authorization: `Bearer ${token}` },
            payload: {
                results: [
                    {
                        idempotencyKey: 'idem-1-abcdef',
                        monitorId: ownMonitor.id,
                        checkedAt: new Date().toISOString(),
                        isUp: true,
                        responseTimeMs: 42,
                        statusCode: 200,
                    },
                ],
            },
        });

        expect(second.statusCode).toBe(200);
        const secondBody = JSON.parse(second.body);
        expect(secondBody.acceptedCount).toBe(0);
        expect(secondBody.duplicateCount).toBe(1);

        const rows = await prisma.checkResult.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0].agentId).toBe(agent.id);
        expect(rows[0].monitorId).toBe(ownMonitor.id);
    });

    it('heartbeat updates status and lastSeen', async () => {
        const token = 'agent-heartbeat-token';
        const oldSeen = new Date(Date.now() - 10 * 60 * 1000);

        const agent = await prisma.agent.create({
            data: {
                name: 'agent-heartbeat',
                tokenHash: hashAgentToken(token),
                status: 'OFFLINE',
                lastSeen: oldSeen,
                heartbeatIntervalSec: 25,
            },
        });

        const res = await app.inject({
            method: 'POST',
            url: '/api/agent/heartbeat',
            headers: { Authorization: `Bearer ${token}` },
            payload: {
                agentVersion: '0.1.0',
                queueSize: 3,
                inFlightChecks: 1,
            },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.heartbeatIntervalSec).toBe(25);
        expect(body.commands).toEqual(['NONE']);

        const updated = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } });
        expect(updated.status).toBe('ONLINE');
        expect(updated.lastSeen.getTime()).toBeGreaterThan(oldSeen.getTime());
    });
});
