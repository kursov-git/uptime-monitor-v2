import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { FlappingService } from '../services/flapping';

const HOUR_MS = 60 * 60 * 1000;
const HISTORY_BUCKETS = 24;

function getPublicMonitorStatus(monitor: {
    isActive: boolean;
    checkResults: Array<{ isUp: boolean }>;
}): 'up' | 'down' | 'paused' | 'unknown' {
    if (!monitor.isActive) {
        return 'paused';
    }

    const lastCheck = monitor.checkResults[0];
    if (!lastCheck) {
        return 'unknown';
    }

    return lastCheck.isUp ? 'up' : 'down';
}

function alignToHour(date: Date): Date {
    const aligned = new Date(date);
    aligned.setUTCMinutes(0, 0, 0);
    return aligned;
}

function createEmptyBucketSeries(startTime: Date) {
    return Array.from({ length: HISTORY_BUCKETS }, (_, index) => ({
        timestamp: new Date(startTime.getTime() + index * HOUR_MS).toISOString(),
        totalChecks: 0,
        upChecks: 0,
        responseTimeTotalMs: 0,
    }));
}

export default async function publicRoutes(fastify: FastifyInstance) {
    fastify.get('/status', async () => {
        const generatedAt = new Date();
        const alignedHour = alignToHour(generatedAt);
        const seriesStart = new Date(alignedHour.getTime() - (HISTORY_BUCKETS - 1) * HOUR_MS);

        const monitors = await prisma.monitor.findMany({
            where: {
                isPublic: true,
            },
            include: {
                checkResults: {
                    orderBy: { timestamp: 'desc' },
                    take: 1,
                },
            },
            orderBy: [
                { isActive: 'desc' },
                { name: 'asc' },
            ],
        });

        const monitorIds = monitors.map((monitor) => monitor.id);
        const recentResults = monitorIds.length > 0
            ? await prisma.checkResult.findMany({
                where: {
                    monitorId: { in: monitorIds },
                    timestamp: { gte: seriesStart },
                },
                select: {
                    monitorId: true,
                    timestamp: true,
                    isUp: true,
                    responseTimeMs: true,
                },
                orderBy: { timestamp: 'asc' },
            })
            : [];

        const resultsByMonitorId = new Map<string, typeof recentResults>();
        for (const result of recentResults) {
            const existing = resultsByMonitorId.get(result.monitorId);
            if (existing) {
                existing.push(result);
            } else {
                resultsByMonitorId.set(result.monitorId, [result]);
            }
        }

        const uptimeRows = await Promise.all(
            monitors.map(async (monitor) => {
                const monitorHistory = createEmptyBucketSeries(seriesStart);
                const monitorResults = resultsByMonitorId.get(monitor.id) ?? [];

                for (const result of monitorResults) {
                    const bucketIndex = Math.floor((result.timestamp.getTime() - seriesStart.getTime()) / HOUR_MS);
                    if (bucketIndex < 0 || bucketIndex >= HISTORY_BUCKETS) {
                        continue;
                    }

                    const bucket = monitorHistory[bucketIndex];
                    bucket.totalChecks += 1;
                    bucket.upChecks += result.isUp ? 1 : 0;
                    bucket.responseTimeTotalMs += result.responseTimeMs;
                }

                const total24h = monitorHistory.reduce((sum, bucket) => sum + bucket.totalChecks, 0);
                const up24h = monitorHistory.reduce((sum, bucket) => sum + bucket.upChecks, 0);

                const state = FlappingService.getDiagnosticState(monitor.id);
                const status = getPublicMonitorStatus(monitor);
                const uptimePercent24h = total24h > 0 ? ((up24h / total24h) * 100).toFixed(1) : '—';

                return {
                    id: monitor.id,
                    name: monitor.name,
                    url: monitor.url,
                    method: monitor.method,
                    isActive: monitor.isActive,
                    status: state && status === 'down' ? 'down' : status,
                    lastCheck: monitor.checkResults[0] || null,
                    uptimePercent24h,
                    history24h: monitorHistory.map((bucket) => ({
                        timestamp: bucket.timestamp,
                        totalChecks: bucket.totalChecks,
                        upChecks: bucket.upChecks,
                        uptimePercent: bucket.totalChecks > 0
                            ? Number(((bucket.upChecks / bucket.totalChecks) * 100).toFixed(1))
                            : null,
                        avgResponseTimeMs: bucket.totalChecks > 0
                            ? Math.round(bucket.responseTimeTotalMs / bucket.totalChecks)
                            : null,
                    })),
                };
            })
        );

        const summary = uptimeRows.reduce((acc, monitor) => {
            acc[monitor.status] += 1;
            return acc;
        }, {
            up: 0,
            down: 0,
            paused: 0,
            unknown: 0,
        });

        const history24h = createEmptyBucketSeries(seriesStart).map((bucket, index) => {
            const totals = uptimeRows.reduce((acc, monitor) => {
                const monitorBucket = monitor.history24h[index];
                acc.totalChecks += monitorBucket.totalChecks;
                acc.upChecks += monitorBucket.upChecks;
                acc.responseTimeSamples += monitorBucket.avgResponseTimeMs !== null ? monitorBucket.totalChecks : 0;
                acc.responseTimeTotalMs += monitorBucket.avgResponseTimeMs !== null
                    ? monitorBucket.avgResponseTimeMs * monitorBucket.totalChecks
                    : 0;
                return acc;
            }, {
                totalChecks: 0,
                upChecks: 0,
                responseTimeSamples: 0,
                responseTimeTotalMs: 0,
            });

            return {
                timestamp: bucket.timestamp,
                totalChecks: totals.totalChecks,
                upChecks: totals.upChecks,
                uptimePercent: totals.totalChecks > 0
                    ? Number(((totals.upChecks / totals.totalChecks) * 100).toFixed(1))
                    : null,
                avgResponseTimeMs: totals.responseTimeSamples > 0
                    ? Math.round(totals.responseTimeTotalMs / totals.responseTimeSamples)
                    : null,
            };
        });

        return {
            generatedAt: generatedAt.toISOString(),
            monitorCount: uptimeRows.length,
            summary,
            history24h,
            monitors: uptimeRows,
        };
    });
}
