import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { publicStatusService } from '../services/publicStatus';

const HOUR_MS = 60 * 60 * 1000;
const DRILLDOWN_BUCKET_MINUTES = 5;
const DRILLDOWN_BUCKET_MS = DRILLDOWN_BUCKET_MINUTES * 60 * 1000;
const DRILLDOWN_BUCKET_COUNT = HOUR_MS / DRILLDOWN_BUCKET_MS;

function alignToHour(date: Date): Date {
    const aligned = new Date(date);
    aligned.setUTCMinutes(0, 0, 0);
    return aligned;
}

function createEmptyDrilldownSeries(startTime: Date) {
    return Array.from({ length: DRILLDOWN_BUCKET_COUNT }, (_, index) => ({
        timestamp: new Date(startTime.getTime() + index * DRILLDOWN_BUCKET_MS).toISOString(),
        totalChecks: 0,
        upChecks: 0,
        responseTimeTotalMs: 0,
    }));
}

export default async function publicRoutes(fastify: FastifyInstance) {
    fastify.get('/status', async (request, reply) => {
        try {
            const snapshot = await publicStatusService.getSnapshot();
            reply.header('Cache-Control', 'public, max-age=5, stale-while-revalidate=5');
            return snapshot;
        } catch (err) {
            request.log.error({ err }, 'Failed to serve public status snapshot');
            return reply.status(503).send({ error: 'Public status temporarily unavailable' });
        }
    });

    fastify.get<{ Params: { monitorId: string }; Querystring: { start?: string } }>('/status/:monitorId/drilldown', async (request, reply) => {
        const { monitorId } = request.params;
        const start = request.query.start;
        const parsedStart = start ? new Date(start) : null;

        if (!parsedStart || Number.isNaN(parsedStart.getTime())) {
            return reply.status(400).send({ error: 'Valid start query parameter is required' });
        }

        const windowStart = alignToHour(parsedStart);
        const windowEnd = new Date(windowStart.getTime() + HOUR_MS);

        const monitor = await prisma.monitor.findFirst({
            where: {
                id: monitorId,
                isPublic: true,
            },
            select: {
                id: true,
                name: true,
            },
        });

        if (!monitor) {
            return reply.status(404).send({ error: 'Public monitor not found' });
        }

        const results = await prisma.checkResult.findMany({
            where: {
                monitorId: monitor.id,
                timestamp: {
                    gte: windowStart,
                    lt: windowEnd,
                },
            },
            select: {
                timestamp: true,
                isUp: true,
                responseTimeMs: true,
                statusCode: true,
                error: true,
            },
            orderBy: { timestamp: 'asc' },
        });

        const history = createEmptyDrilldownSeries(windowStart);
        for (const result of results) {
            const bucketIndex = Math.floor((result.timestamp.getTime() - windowStart.getTime()) / DRILLDOWN_BUCKET_MS);
            if (bucketIndex < 0 || bucketIndex >= DRILLDOWN_BUCKET_COUNT) {
                continue;
            }

            const bucket = history[bucketIndex];
            bucket.totalChecks += 1;
            bucket.upChecks += result.isUp ? 1 : 0;
            bucket.responseTimeTotalMs += result.responseTimeMs;
        }

        const totalChecks = results.length;
        const upChecks = results.filter((result) => result.isUp).length;

        return {
            monitorId: monitor.id,
            monitorName: monitor.name,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
            bucketSizeMinutes: DRILLDOWN_BUCKET_MINUTES,
            totalChecks,
            upChecks,
            uptimePercent: totalChecks > 0 ? Number(((upChecks / totalChecks) * 100).toFixed(1)) : null,
            history: history.map((bucket) => ({
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
            failures: results
                .filter((result) => !result.isUp)
                .map((result) => ({
                    timestamp: result.timestamp.toISOString(),
                    responseTimeMs: result.responseTimeMs,
                    statusCode: result.statusCode,
                    error: result.error,
                })),
        };
    });
}
