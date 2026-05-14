import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import { buildPublicStatusSnapshot, PublicStatusService } from '../services/publicStatus';

describe('PublicStatusService', () => {
    beforeEach(async () => {
        await prisma.notificationHistory.deleteMany();
        await prisma.auditLog.deleteMany();
        await prisma.checkResult.deleteMany();
        await prisma.monitor.deleteMany();
        await prisma.apiKey.deleteMany();
        await prisma.user.deleteMany();
        await prisma.notificationSettings.deleteMany();
    });

    it('builds hourly history from aggregated check results', async () => {
        const now = new Date();
        const currentHour = new Date(now);
        currentHour.setUTCMinutes(0, 0, 0);
        const previousHour = new Date(currentHour.getTime() - 60 * 60 * 1000);

        const publicMonitor = await prisma.monitor.create({
            data: {
                name: 'Public Monitor Aggregate',
                url: 'https://example.com/public-aggregate',
                method: 'GET',
                isPublic: true,
            },
        });

        await prisma.checkResult.createMany({
            data: [
                {
                    monitorId: publicMonitor.id,
                    isUp: true,
                    responseTimeMs: 100,
                    statusCode: 200,
                    timestamp: new Date(currentHour.getTime() + 5 * 60 * 1000),
                },
                {
                    monitorId: publicMonitor.id,
                    isUp: true,
                    responseTimeMs: 200,
                    statusCode: 200,
                    timestamp: new Date(currentHour.getTime() + 25 * 60 * 1000),
                },
                {
                    monitorId: publicMonitor.id,
                    isUp: false,
                    responseTimeMs: 450,
                    statusCode: 503,
                    error: 'Service unavailable',
                    timestamp: new Date(previousHour.getTime() + 30 * 60 * 1000),
                },
            ],
        });

        const snapshot = await buildPublicStatusSnapshot(prisma);

        expect(snapshot.monitorCount).toBe(1);
        expect(snapshot.monitors).toHaveLength(1);
        expect(snapshot.history24h).toHaveLength(24);
        expect(snapshot.monitors[0].history24h).toHaveLength(24);

        const currentBucket = snapshot.monitors[0].history24h.find((bucket) => bucket.timestamp === currentHour.toISOString());
        const previousBucket = snapshot.monitors[0].history24h.find((bucket) => bucket.timestamp === previousHour.toISOString());

        expect(currentBucket).toMatchObject({
            totalChecks: 2,
            upChecks: 2,
            uptimePercent: 100,
            avgResponseTimeMs: 150,
        });
        expect(previousBucket).toMatchObject({
            totalChecks: 1,
            upChecks: 0,
            uptimePercent: 0,
            avgResponseTimeMs: 450,
        });
        expect(snapshot.history24h.find((bucket) => bucket.timestamp === currentHour.toISOString())).toMatchObject({
            totalChecks: 2,
            upChecks: 2,
            uptimePercent: 100,
            avgResponseTimeMs: 150,
        });
    });

    it('reuses cached snapshot within ttl', async () => {
        let nowMs = 10_000;
        const buildSnapshot = vi
            .fn()
            .mockResolvedValue({
                generatedAt: '2026-04-20T00:00:00.000Z',
                monitorCount: 0,
                summary: { up: 0, down: 0, paused: 0, unknown: 0 },
                history24h: [],
                monitors: [],
            });

        const service = new PublicStatusService({
            ttlMs: 5_000,
            now: () => nowMs,
            buildSnapshot: async () => buildSnapshot(),
        });

        const first = await service.getSnapshot();
        nowMs += 1_000;
        const second = await service.getSnapshot();

        expect(first.generatedAt).toBe('2026-04-20T00:00:00.000Z');
        expect(second.generatedAt).toBe('2026-04-20T00:00:00.000Z');
        expect(buildSnapshot).toHaveBeenCalledTimes(1);
        expect(service.getStatus()).toMatchObject({
            hasSnapshot: true,
            hitCount: 1,
            missCount: 1,
            staleServeCount: 0,
            refreshInFlight: false,
        });
    });

    it('serves stale snapshot while refresh is in flight', async () => {
        let nowMs = 10_000;
        let resolveRefresh: ((value: {
            generatedAt: string;
            monitorCount: number;
            summary: { up: number; down: number; paused: number; unknown: number };
            history24h: [];
            monitors: [];
        }) => void) | null = null;

        const buildSnapshot = vi
            .fn()
            .mockResolvedValueOnce({
                generatedAt: '2026-04-20T00:00:00.000Z',
                monitorCount: 0,
                summary: { up: 0, down: 0, paused: 0, unknown: 0 },
                history24h: [],
                monitors: [],
            })
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveRefresh = resolve;
            }));

        const service = new PublicStatusService({
            ttlMs: 5_000,
            now: () => nowMs,
            buildSnapshot: async () => buildSnapshot(),
        });

        await service.getSnapshot();

        nowMs += 6_000;
        const staleSnapshot = await service.getSnapshot();

        expect(staleSnapshot.generatedAt).toBe('2026-04-20T00:00:00.000Z');
        expect(buildSnapshot).toHaveBeenCalledTimes(2);
        expect(service.getStatus()).toMatchObject({
            staleServeCount: 1,
            refreshInFlight: true,
        });

        resolveRefresh?.({
            generatedAt: '2026-04-20T00:00:06.000Z',
            monitorCount: 0,
            summary: { up: 0, down: 0, paused: 0, unknown: 0 },
            history24h: [],
            monitors: [],
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        const refreshedSnapshot = await service.getSnapshot();
        expect(refreshedSnapshot.generatedAt).toBe('2026-04-20T00:00:06.000Z');
    });
});
