import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CheckWorker } from '../worker';
import prisma from '../lib/prisma';
import { performCheck } from '@uptime-monitor/checker';
import { encrypt } from '../lib/crypto';

vi.mock('@uptime-monitor/checker', () => ({
    performCheck: vi.fn(),
}));

describe('CheckWorker', () => {
    let worker: CheckWorker;
    const originalEncryptionKey = process.env.ENCRYPTION_KEY;

    beforeEach(async () => {
        worker = new CheckWorker(prisma);

        await prisma.checkResult.deleteMany();
        await prisma.monitor.deleteMany();
        vi.clearAllMocks();
    });

    afterEach(() => {
        worker.stop();
        if (originalEncryptionKey) {
            process.env.ENCRYPTION_KEY = originalEncryptionKey;
        } else {
            delete process.env.ENCRYPTION_KEY;
        }
        vi.restoreAllMocks();
    });

    it('should record a successful check on 200 OK', async () => {
        const monitor = await prisma.monitor.create({
            data: {
                name: 'Worker Test',
                url: 'https://example.com/api',
                method: 'GET',
                expectedStatus: 200,
            }
        });

        vi.mocked(performCheck).mockResolvedValue({
            isUp: true,
            responseTimeMs: 42,
            statusCode: 200,
            error: null,
        });

        await (worker as any).performCheck(monitor);

        const results = await prisma.checkResult.findMany({ where: { monitorId: monitor.id } });
        expect(results).toHaveLength(1);
        expect(results[0].isUp).toBe(true);
        expect(results[0].statusCode).toBe(200);
        expect(results[0].error).toBeNull();
    });

    it('should record a failed check', async () => {
        const monitor = await prisma.monitor.create({
            data: {
                name: 'Bad Status Test',
                url: 'https://example.com/api',
                method: 'GET',
                expectedStatus: 200,
            }
        });

        vi.mocked(performCheck).mockResolvedValue({
            isUp: false,
            responseTimeMs: 100,
            statusCode: 500,
            error: 'Expected status 200, got 500',
        });

        await (worker as any).performCheck(monitor);

        const results = await prisma.checkResult.findMany({ where: { monitorId: monitor.id } });
        expect(results).toHaveLength(1);
        expect(results[0].isUp).toBe(false);
        expect(results[0].statusCode).toBe(500);
        expect(results[0].error).toBe('Expected status 200, got 500');
    });

    it('should decrypt auth payload before delegating to checker', async () => {
        process.env.ENCRYPTION_KEY = 'b'.repeat(64);
        const encryptedPayload = encrypt(JSON.stringify({
            username: 'worker_user',
            password: 'worker_pass',
        }));

        const monitor = await prisma.monitor.create({
            data: {
                name: 'Encrypted Basic Auth',
                url: 'https://example.com/protected',
                method: 'GET',
                expectedStatus: 200,
                authMethod: 'BASIC',
                authPayload: encryptedPayload,
            },
        });

        vi.mocked(performCheck).mockResolvedValue({
            isUp: true,
            responseTimeMs: 33,
            statusCode: 200,
            error: null,
        });

        await (worker as any).performCheck(monitor);

        expect(performCheck).toHaveBeenCalledTimes(1);
        expect(vi.mocked(performCheck).mock.calls[0][0]).toMatchObject({
            authMethod: 'BASIC',
            authPayload: JSON.stringify({
                username: 'worker_user',
                password: 'worker_pass',
            }),
        });
    });
});
