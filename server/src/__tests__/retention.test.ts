import { describe, it, expect, beforeEach, vi } from 'vitest';
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

        const status = service.getStatus();
        expect(status.lastDeleteBatchCount).toBeGreaterThan(0);
        expect(status.lastBusyRetryCount).toBe(0);
    });

    it('splits large retention cleanup into multiple batches', async () => {
        await prisma.notificationSettings.create({
            data: { retentionDays: 1 },
        });

        const monitor = await prisma.monitor.create({
            data: {
                name: 'Retention Batch Monitor',
                url: 'https://example.com/retention-batch',
                method: 'GET',
            },
        });

        const oldTimestamp = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));

        await prisma.checkResult.createMany({
            data: Array.from({ length: 260 }, (_, index) => ({
                monitorId: monitor.id,
                isUp: true,
                responseTimeMs: 10 + index,
                statusCode: 200,
                error: null,
                timestamp: oldTimestamp,
            })),
        });

        const service = new RetentionService(prisma);
        await (service as any).cleanup();

        expect(await prisma.checkResult.count()).toBe(0);
        expect(service.getStatus().lastDeleteBatchCount).toBeGreaterThan(1);
    });

    it('retries retention batches when SQLite is busy', async () => {
        const busyError = new Error('SQLITE_BUSY: database is locked');
        const findFirst = vi.fn().mockResolvedValue({ retentionDays: 1 });
        const checkResultFindMany = vi.fn()
            .mockRejectedValueOnce(busyError)
            .mockResolvedValueOnce([{ id: 'check-1' }])
            .mockResolvedValueOnce([]);
        const checkResultDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
        const auditLogFindMany = vi.fn().mockResolvedValue([]);
        const auditLogDeleteMany = vi.fn();
        const notificationHistoryFindMany = vi.fn().mockResolvedValue([]);
        const notificationHistoryDeleteMany = vi.fn();

        const fakePrisma = {
            notificationSettings: {
                findFirst,
            },
            checkResult: {
                findMany: checkResultFindMany,
                deleteMany: checkResultDeleteMany,
            },
            auditLog: {
                findMany: auditLogFindMany,
                deleteMany: auditLogDeleteMany,
            },
            notificationHistory: {
                findMany: notificationHistoryFindMany,
                deleteMany: notificationHistoryDeleteMany,
            },
            $queryRawUnsafe: vi.fn().mockResolvedValue([{ journal_mode: 'wal' }]),
            $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        } as any;

        const service = new RetentionService(fakePrisma);
        await (service as any).cleanup();

        expect(checkResultFindMany).toHaveBeenCalledTimes(2);
        expect(checkResultDeleteMany).toHaveBeenCalledTimes(1);
        expect(service.getStatus().lastBusyRetryCount).toBe(1);
        expect(service.getStatus().lastDeletedCheckResults).toBe(1);
        expect(service.getStatus().lastError).toBeNull();
    });
});
