import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initApp } from '../index';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
    app = await initApp();
    await app.ready();

    const passwordHash = await bcrypt.hash('password123', 10);

    await prisma.notificationHistory.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();

    const admin = await prisma.user.create({
        data: { username: 'admin_notes', passwordHash, role: 'ADMIN' }
    });

    adminToken = app.jwt.sign({ id: admin.id, username: admin.username, role: admin.role });
});

afterAll(async () => {
    await app.close();
});

beforeEach(async () => {
    await prisma.notificationHistory.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
});

describe('Notifications API (Integration)', () => {
    it('should return recent notifications filtered by monitorId', async () => {
        // Create 2 monitors
        const m1 = await prisma.monitor.create({ data: { name: 'M1', url: 'http://m1.com', method: 'GET' } });
        const m2 = await prisma.monitor.create({ data: { name: 'M2', url: 'http://m2.com', method: 'GET' } });

        // Insert notification history
        await prisma.notificationHistory.createMany({
            data: [
                { monitorId: m1.id, channel: 'TELEGRAM', status: 'SUCCESS' },
                { monitorId: m1.id, channel: 'ZULIP', status: 'SUCCESS' },
                { monitorId: m2.id, channel: 'TELEGRAM', status: 'SUCCESS' },
            ]
        });

        const res = await app.inject({
            method: 'GET',
            url: `/api/notifications/history?monitorId=${m1.id}`,
            headers: { Authorization: `Bearer ${adminToken}` }
        });

        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);

        expect(data.pagination.total).toBe(2);
        expect(data.history.length).toBe(2);
        expect(data.history[0].monitorId).toBe(m1.id);
        expect(data.history[1].monitorId).toBe(m1.id);
    });

    it('should return all notifications if no monitorId supplied', async () => {
        const m1 = await prisma.monitor.create({ data: { name: 'M1', url: 'http://m1.com', method: 'GET' } });

        await prisma.notificationHistory.createMany({
            data: [
                { monitorId: m1.id, channel: 'TELEGRAM', status: 'SUCCESS' },
                { monitorId: m1.id, channel: 'ZULIP', status: 'SUCCESS' },
            ]
        });

        const res = await app.inject({
            method: 'GET',
            url: `/api/notifications/history`,
            headers: { Authorization: `Bearer ${adminToken}` }
        });

        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.pagination.total).toBe(2);
        expect(data.history.length).toBe(2);
    });
});
