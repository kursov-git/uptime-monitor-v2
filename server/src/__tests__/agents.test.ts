import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { initApp } from '../index';
import prisma from '../lib/prisma';

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
    await prisma.monitor.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
});

async function createAdminToken() {
    const passwordHash = await bcrypt.hash('secret123', 10);
    const user = await prisma.user.create({
        data: { username: 'agents-admin', passwordHash, role: 'ADMIN' },
    });
    return app.jwt.sign({ id: user.id, username: user.username, role: user.role });
}

describe('Agents API (Integration)', () => {
    it('creates, lists, rotates and revokes agent token', async () => {
        const token = await createAdminToken();

        const createRes = await app.inject({
            method: 'POST',
            url: '/api/agents',
            headers: { Authorization: `Bearer ${token}` },
            payload: {
                name: 'us-east-1',
                heartbeatIntervalSec: 20,
                offlineAfterSec: 80,
            },
        });

        expect(createRes.statusCode).toBe(201);
        const created = JSON.parse(createRes.body);
        expect(created.agent.name).toBe('us-east-1');
        expect(typeof created.token).toBe('string');

        const listRes = await app.inject({
            method: 'GET',
            url: '/api/agents',
            headers: { Authorization: `Bearer ${token}` },
        });

        expect(listRes.statusCode).toBe(200);
        const list = JSON.parse(listRes.body);
        expect(list).toHaveLength(1);

        const rotateRes = await app.inject({
            method: 'POST',
            url: `/api/agents/${created.agent.id}/rotate-token`,
            headers: { Authorization: `Bearer ${token}` },
        });

        expect(rotateRes.statusCode).toBe(200);
        const rotated = JSON.parse(rotateRes.body);
        expect(typeof rotated.token).toBe('string');
        expect(rotated.token).not.toBe(created.token);

        const revokeRes = await app.inject({
            method: 'POST',
            url: `/api/agents/${created.agent.id}/revoke`,
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(revokeRes.statusCode).toBe(200);

        const revokedAgent = await prisma.agent.findUniqueOrThrow({ where: { id: created.agent.id } });
        expect(revokedAgent.revokedAt).not.toBeNull();
        expect(revokedAgent.status).toBe('OFFLINE');

        const audit = await prisma.auditLog.findMany({ orderBy: { timestamp: 'asc' } });
        const actions = audit.map((a) => a.action);
        expect(actions).toContain('AGENT_CREATED');
        expect(actions).toContain('AGENT_TOKEN_ROTATED');
        expect(actions).toContain('AGENT_REVOKED');
    });
});
