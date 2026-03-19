import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initApp } from '../index';
import prisma from '../lib/prisma';
import { hashAgentToken } from '../services/agentAuth';

vi.mock('../services/geoip', () => ({
    resolveAgentGeo: vi.fn(() => ({
        ip: '203.0.113.10',
        country: 'RU',
        city: 'Moscow',
    })),
}));

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

    it('rejects legacy plaintext agent tokens stored in the database', async () => {
        const token = 'legacy-plain-token';

        await prisma.agent.create({
            data: {
                name: 'legacy-agent',
                tokenHash: token,
            },
        });

        const res = await app.inject({
            method: 'GET',
            url: '/api/agent/jobs',
            headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(401);
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
                method: 'POST',
                intervalSeconds: 10,
                timeoutSeconds: 5,
                requestBody: '{"beep":"boop"}',
                sslExpiryEnabled: true,
                sslExpiryThresholdDays: 21,
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
        expect(body.jobs[0].requestBody).toBe('{"beep":"boop"}');
        expect(body.jobs[0].sslExpiryEnabled).toBe(true);
        expect(body.jobs[0].sslExpiryThresholdDays).toBe(21);
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
                        meta: {
                            ssl: {
                                expiresAt: '2026-06-10T12:00:00.000Z',
                                daysRemaining: 89,
                                issuer: 'Let\'s Encrypt E7',
                                subject: 'example.com',
                            },
                        },
                    },
                    {
                        idempotencyKey: 'idem-2-abcdef',
                        monitorId: ownMonitor.id,
                        checkedAt: new Date().toISOString(),
                        isUp: true,
                        responseTimeMs: 42,
                        statusCode: 200,
                    },
                    {
                        idempotencyKey: 'idem-3-abcdef',
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
        expect(firstBody.acceptedCount).toBe(2);
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

        const third = await app.inject({
            method: 'POST',
            url: '/api/agent/results',
            headers: { Authorization: `Bearer ${token}` },
            payload: {
                results: [
                    {
                        idempotencyKey: 'idem-dup-payload',
                        monitorId: ownMonitor.id,
                        checkedAt: new Date().toISOString(),
                        isUp: true,
                        responseTimeMs: 44,
                        statusCode: 200,
                    },
                    {
                        idempotencyKey: 'idem-dup-payload',
                        monitorId: ownMonitor.id,
                        checkedAt: new Date().toISOString(),
                        isUp: true,
                        responseTimeMs: 44,
                        statusCode: 200,
                    },
                ],
            },
        });

        expect(third.statusCode).toBe(200);
        const thirdBody = JSON.parse(third.body);
        expect(thirdBody.acceptedCount).toBe(1);
        expect(thirdBody.duplicateCount).toBe(1);

        const rows = await prisma.checkResult.findMany();
        expect(rows).toHaveLength(3);
        expect(rows.every((row) => row.agentId === agent.id)).toBe(true);
        expect(rows.every((row) => row.monitorId === ownMonitor.id)).toBe(true);
        const sslRow = rows.find((row) => row.resultIdempotencyKey === 'idem-1-abcdef');
        expect(sslRow?.sslExpiresAt?.toISOString()).toBe('2026-06-10T12:00:00.000Z');
        expect(sslRow?.sslDaysRemaining).toBe(89);
        expect(sslRow?.sslIssuer).toBe('Let\'s Encrypt E7');
        expect(sslRow?.sslSubject).toBe('example.com');
    });

    it('heartbeat updates status, lastSeen, and connection geo metadata', async () => {
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
        expect(updated.agentVersion).toBe('0.1.0');
        expect(updated.lastSeenIp).toBe('203.0.113.10');
        expect(updated.lastSeenCountry).toBe('RU');
        expect(updated.lastSeenCity).toBe('Moscow');
    });
});
