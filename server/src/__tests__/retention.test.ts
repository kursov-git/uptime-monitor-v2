import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '../lib/prisma';
import { RetentionService } from '../services/retentionService';

describe('RetentionService', () => {
    beforeEach(async () => {
        await prisma.notificationHistory.deleteMany();
        await prisma.auditLog.deleteMany();
        await prisma.checkResult.deleteMany();
        await prisma.monitor.deleteMany();
        await prisma.notificationSettings.deleteMany();
    });

    it('deletes stale records and keeps recent records across retention-managed tables', async () => {
        await prisma.notificationSettings.create({
            data: { retentionDays: 1 },
        });

        const monitor = await prisma.monitor.create({
            data: {
                name: 'Retention Monitor',
                url: 'https://example.com/retention',
                method: 'GET',
            },
        });

        const now = new Date();
        const oldTimestamp = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
        const recentTimestamp = new Date(now.getTime() - (6 * 60 * 60 * 1000));

        await prisma.checkResult.createMany({
            data: [
                {
                    monitorId: monitor.id,
                    isUp: true,
                    responseTimeMs: 10,
                    statusCode: 200,
                    error: null,
                    timestamp: oldTimestamp,
                },
                {
                    monitorId: monitor.id,
                    isUp: true,
                    responseTimeMs: 15,
                    statusCode: 200,
                    error: null,
                    timestamp: recentTimestamp,
                },
            ],
        });

        await prisma.auditLog.createMany({
            data: [
                { action: 'OLD_AUDIT', timestamp: oldTimestamp },
                { action: 'NEW_AUDIT', timestamp: recentTimestamp },
            ],
        });

        await prisma.notificationHistory.createMany({
            data: [
                { monitorId: monitor.id, channel: 'TELEGRAM', status: 'SUCCESS', timestamp: oldTimestamp },
                { monitorId: monitor.id, channel: 'ZULIP', status: 'SUCCESS', timestamp: recentTimestamp },
            ],
        });

        const service = new RetentionService(prisma);
        await (service as any).cleanup();

        const [checkResults, auditLogs, notifications] = await Promise.all([
            prisma.checkResult.findMany({ orderBy: { timestamp: 'asc' } }),
            prisma.auditLog.findMany({ orderBy: { timestamp: 'asc' } }),
            prisma.notificationHistory.findMany({ orderBy: { timestamp: 'asc' } }),
        ]);

        expect(checkResults).toHaveLength(1);
        expect(auditLogs).toHaveLength(1);
        expect(notifications).toHaveLength(1);

        expect(checkResults[0].timestamp.getTime()).toBeGreaterThan(oldTimestamp.getTime());
        expect(auditLogs[0].action).toBe('NEW_AUDIT');
        expect(notifications[0].channel).toBe('ZULIP');
    });
});
