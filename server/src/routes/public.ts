import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { FlappingService } from '../services/flapping';

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

export default async function publicRoutes(fastify: FastifyInstance) {
    fastify.get('/status', async () => {
        const generatedAt = new Date();
        const since24h = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);

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

        const uptimeRows = await Promise.all(
            monitors.map(async (monitor) => {
                const [total24h, up24h] = await Promise.all([
                    prisma.checkResult.count({
                        where: {
                            monitorId: monitor.id,
                            timestamp: { gte: since24h },
                        },
                    }),
                    prisma.checkResult.count({
                        where: {
                            monitorId: monitor.id,
                            isUp: true,
                            timestamp: { gte: since24h },
                        },
                    }),
                ]);

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

        return {
            generatedAt: generatedAt.toISOString(),
            monitorCount: uptimeRows.length,
            summary,
            monitors: uptimeRows,
        };
    });
}
