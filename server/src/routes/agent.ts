import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticateAgent } from '../services/agentAuth';
import { agentSseService } from '../services/agentSse';
import { envBool } from '../lib/utils';

const resultItemSchema = z.object({
    idempotencyKey: z.string().min(8),
    monitorId: z.string().uuid(),
    checkedAt: z.string().datetime().optional(),
    isUp: z.boolean(),
    responseTimeMs: z.number().int().nonnegative(),
    statusCode: z.number().int().min(100).max(599).nullable().optional(),
    error: z.string().max(4000).nullable().optional(),
    meta: z.unknown().optional(),
});

const resultsSchema = z.object({
    results: z.array(resultItemSchema).min(1).max(500),
});

const heartbeatSchema = z.object({
    agentVersion: z.string().max(128).optional(),
    queueSize: z.number().int().nonnegative().optional(),
    inFlightChecks: z.number().int().nonnegative().optional(),
});

export default async function agentRoutes(fastify: FastifyInstance) {
    fastify.get('/stream', {
        preHandler: [authenticateAgent],
    }, async (request, reply) => {
        const agent = request.agent!;
        const sseEnabled = envBool('AGENT_SSE_ENABLED', true);
        if (!sseEnabled) {
            return reply.status(503).send({
                error: 'Agent SSE disabled',
                command: 'RESYNC_JOBS',
            });
        }

        const rawLastEventId = request.headers['last-event-id'];
        const lastEventId = typeof rawLastEventId === 'string'
            ? Number.parseInt(rawLastEventId, 10) || 0
            : 0;

        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.flushHeaders();

        const added = agentSseService.addClient(reply, agent.id);
        if (!added) {
            return reply.status(503).send({ error: 'Too many SSE connections' });
        }

        const replayStatus = agentSseService.replaySince(agent.id, lastEventId);
        if (replayStatus.stale) {
            reply.raw.write('event: agent.command\ndata: {"command":"RESYNC_JOBS"}\n\n');
        } else if (lastEventId > 0) {
            agentSseService.replayToClient(reply, agent.id, lastEventId);
        }

        reply.raw.write('event: connected\ndata: {"status":"ok"}\n\n');
        return reply.hijack();
    });

    fastify.get('/jobs', {
        preHandler: [authenticateAgent],
    }, async (request) => {
        const agent = request.agent!;

        const jobs = await prisma.monitor.findMany({
            where: {
                isActive: true,
                agentId: agent.id,
            },
            select: {
                id: true,
                url: true,
                method: true,
                intervalSeconds: true,
                timeoutSeconds: true,
                expectedStatus: true,
                expectedBody: true,
                headers: true,
                authMethod: true,
                authUrl: true,
                authPayload: true,
                authTokenRegex: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        return {
            serverTime: new Date().toISOString(),
            heartbeatIntervalSec: agent.heartbeatIntervalSec,
            jobs: jobs.map((job) => ({
                monitorId: job.id,
                url: job.url,
                method: job.method,
                intervalSeconds: job.intervalSeconds,
                timeoutMs: job.timeoutSeconds * 1000,
                expectedStatus: job.expectedStatus,
                expectedBody: job.expectedBody,
                headers: job.headers,
                authMethod: job.authMethod,
                authUrl: job.authUrl,
                authPayloadEncrypted: job.authPayload,
                authTokenRegex: job.authTokenRegex,
                authPayloadIv: null,
                authPayloadTag: null,
                keyVersion: agent.keyVersion,
                version: job.updatedAt.getTime(),
            })),
        };
    });

    fastify.post('/results', {
        preHandler: [authenticateAgent],
    }, async (request, reply) => {
        const parse = resultsSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ error: 'Invalid payload', details: parse.error.issues });
        }

        const agent = request.agent!;
        const { results } = parse.data;

        const monitorIds = [...new Set(results.map(r => r.monitorId))];
        const allowedMonitors = await prisma.monitor.findMany({
            where: {
                id: { in: monitorIds },
                agentId: agent.id,
            },
            select: { id: true },
        });
        const allowedSet = new Set(allowedMonitors.map(m => m.id));

        let acceptedCount = 0;
        let duplicateCount = 0;
        const failed: Array<{ idempotencyKey: string; reason: string }> = [];

        for (const item of results) {
            if (!allowedSet.has(item.monitorId)) {
                failed.push({ idempotencyKey: item.idempotencyKey, reason: 'MONITOR_NOT_ASSIGNED_TO_AGENT' });
                continue;
            }

            try {
                await prisma.checkResult.create({
                    data: {
                        monitorId: item.monitorId,
                        agentId: agent.id,
                        resultIdempotencyKey: item.idempotencyKey,
                        timestamp: item.checkedAt ? new Date(item.checkedAt) : new Date(),
                        isUp: item.isUp,
                        responseTimeMs: item.responseTimeMs,
                        statusCode: item.statusCode ?? null,
                        error: item.error ?? null,
                    },
                });
                acceptedCount += 1;
            } catch (err: any) {
                if (err?.code === 'P2002') {
                    duplicateCount += 1;
                    continue;
                }
                failed.push({ idempotencyKey: item.idempotencyKey, reason: 'DB_WRITE_FAILED' });
            }
        }

        return {
            acceptedCount,
            duplicateCount,
            failed,
        };
    });

    fastify.post('/heartbeat', {
        preHandler: [authenticateAgent],
    }, async (request, reply) => {
        const parse = heartbeatSchema.safeParse(request.body ?? {});
        if (!parse.success) {
            return reply.status(400).send({ error: 'Invalid payload', details: parse.error.issues });
        }

        const agent = request.agent!;
        const updated = await prisma.agent.update({
            where: { id: agent.id },
            data: {
                lastSeen: new Date(),
                status: 'ONLINE',
            },
            select: {
                heartbeatIntervalSec: true,
            },
        });

        return {
            now: new Date().toISOString(),
            heartbeatIntervalSec: updated.heartbeatIntervalSec,
            commands: ['NONE'],
        };
    });
}
