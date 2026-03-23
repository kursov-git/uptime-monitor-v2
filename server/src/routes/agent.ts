import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticateAgent } from '../services/agentAuth';
import { agentSseService } from '../services/agentSse';
import { logAction } from '../services/auditService';
import { persistAgentResults, type AgentResultInput } from '../services/agentResults';
import { serverEnv } from '../lib/env';
import { FlappingService } from '../services/flapping';
import { TelegramNotifier } from '../services/telegram';
import { ZulipNotifier } from '../services/zulip';
import { decrypt } from '../lib/crypto';
import { resolveAgentGeo } from '../services/geoip';
import { buildAgentOnlineMessage, htmlToNotifierText } from '../services/notificationMessages';

const resultItemSchema = z.object({
    idempotencyKey: z.string().min(8),
    monitorId: z.string().uuid(),
    checkedAt: z.string().datetime().optional(),
    isUp: z.boolean(),
    responseTimeMs: z.number().int().nonnegative(),
    statusCode: z.number().int().min(100).max(599).nullable().optional(),
    error: z.string().max(4000).nullable().optional(),
    meta: z.object({
        ssl: z.object({
            expiresAt: z.string().datetime().nullable().optional(),
            daysRemaining: z.number().int().nullable().optional(),
            issuer: z.string().max(512).nullable().optional(),
            subject: z.string().max(512).nullable().optional(),
        }).optional(),
    }).passthrough().optional(),
});

const resultsSchema = z.object({
    results: z.array(resultItemSchema).min(1).max(500),
});

const heartbeatSchema = z.object({
    agentVersion: z.string().max(128).optional(),
    queueSize: z.number().int().nonnegative().optional(),
    inFlightChecks: z.number().int().nonnegative().optional(),
});

const telegramNotifier = new TelegramNotifier();
const zulipNotifier = new ZulipNotifier();

async function sendAgentOnlineNotifications(agent: {
    id: string;
    name: string;
    status: string;
}, previousLastSeen: Date, recoveredAt: Date): Promise<void> {
    if (agent.status === 'ONLINE') {
        return;
    }

    const [settings, monitorsCount] = await Promise.all([
        prisma.notificationSettings.findFirst(),
        prisma.monitor.count({ where: { agentId: agent.id } }),
    ]);

    if (!settings) {
        return;
    }

    const message = buildAgentOnlineMessage(
        agent.name,
        previousLastSeen,
        {
            appBaseUrl: settings.appBaseUrl,
            monitorsCount,
            offlineDurationSec: (recoveredAt.getTime() - previousLastSeen.getTime()) / 1000,
        }
    );

    if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
        const result = await telegramNotifier.send({
            botToken: decrypt(settings.telegramBotToken),
            chatId: settings.telegramChatId,
        }, message);

        await prisma.notificationHistory.create({
            data: {
                monitorId: null,
                channel: 'TELEGRAM',
                status: result.success ? 'SUCCESS' : 'FAILED',
                error: result.error || null,
            },
        });
    }

    if (settings.zulipEnabled && settings.zulipBotEmail && settings.zulipApiKey && settings.zulipServerUrl) {
        const result = await zulipNotifier.send({
            botEmail: settings.zulipBotEmail,
            apiKey: decrypt(settings.zulipApiKey),
            serverUrl: settings.zulipServerUrl,
            stream: settings.zulipStream || 'alerts',
            topic: settings.zulipTopic || 'uptime-monitor',
        }, htmlToNotifierText(message));

        await prisma.notificationHistory.create({
            data: {
                monitorId: null,
                channel: 'ZULIP',
                status: result.success ? 'SUCCESS' : 'FAILED',
                error: result.error || null,
            },
        });
    }
}

export default async function agentRoutes(fastify: FastifyInstance) {
    fastify.get('/stream', {
        preHandler: [authenticateAgent],
    }, async (request, reply) => {
        const agent = request.agent!;
        if (!serverEnv.agentSseEnabled) {
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
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        reply.raw.flushHeaders();

        const added = agentSseService.addClient(reply, agent.id);
        if (!added) {
            reply.header('Retry-After', '5');
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
                serviceName: true,
                type: true,
                url: true,
                dnsRecordType: true,
                method: true,
                intervalSeconds: true,
                timeoutSeconds: true,
                expectedStatus: true,
                expectedBody: true,
                requestBody: true,
                bodyAssertionType: true,
                bodyAssertionPath: true,
                headers: true,
                authMethod: true,
                authUrl: true,
                authPayload: true,
                authTokenRegex: true,
                sslExpiryEnabled: true,
                sslExpiryThresholdDays: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        return {
            serverTime: new Date().toISOString(),
            heartbeatIntervalSec: agent.heartbeatIntervalSec,
            jobs: jobs.map((job) => ({
                monitorId: job.id,
                type: job.type,
                url: job.url,
                dnsRecordType: job.dnsRecordType,
                method: job.method,
                intervalSeconds: job.intervalSeconds,
                timeoutMs: job.timeoutSeconds * 1000,
                expectedStatus: job.expectedStatus,
                expectedBody: job.expectedBody,
                requestBody: job.requestBody,
                bodyAssertionType: job.bodyAssertionType,
                bodyAssertionPath: job.bodyAssertionPath,
                headers: job.headers,
                authMethod: job.authMethod,
                authUrl: job.authUrl,
                authPayloadEncrypted: job.authPayload,
                authTokenRegex: job.authTokenRegex,
                sslExpiryEnabled: job.sslExpiryEnabled,
                sslExpiryThresholdDays: job.sslExpiryThresholdDays,
                authPayloadIv: null,
                authPayloadTag: null,
                keyVersion: agent.keyVersion,
                version: job.updatedAt.getTime(),
            })),
        };
    });

    fastify.post('/results', {
        preHandler: [authenticateAgent],
        config: {
            rateLimit: {
                max: 60,
                timeWindow: '1 minute',
            },
        },
        bodyLimit: 1_000_000,
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
            select: {
                id: true,
                name: true,
                serviceName: true,
                url: true,
                type: true,
                dnsRecordType: true,
                method: true,
                intervalSeconds: true,
                timeoutSeconds: true,
                expectedStatus: true,
                expectedBody: true,
                requestBody: true,
                bodyAssertionType: true,
                bodyAssertionPath: true,
                headers: true,
                authMethod: true,
                authUrl: true,
                authPayload: true,
                authTokenRegex: true,
                sslExpiryEnabled: true,
                sslExpiryThresholdDays: true,
                isActive: true,
                isPublic: true,
                agentId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        const allowedSet = new Set(allowedMonitors.map(m => m.id));
        const allowedMonitorMap = new Map(allowedMonitors.map((monitor) => [monitor.id, monitor]));

        let acceptedCount = 0;
        let duplicateCount = 0;
        const failed: Array<{ idempotencyKey: string; reason: string }> = [];

        const acceptedResults: AgentResultInput[] = results
            .filter((item) => {
                if (allowedSet.has(item.monitorId)) {
                    return true;
                }

                failed.push({ idempotencyKey: item.idempotencyKey, reason: 'MONITOR_NOT_ASSIGNED_TO_AGENT' });
                return false;
            })
            .map((item) => ({
                idempotencyKey: item.idempotencyKey,
                monitorId: item.monitorId,
                timestamp: item.checkedAt ? new Date(item.checkedAt) : new Date(),
                isUp: item.isUp,
                responseTimeMs: item.responseTimeMs,
                statusCode: item.statusCode ?? null,
                error: item.error ?? null,
                sslExpiresAt: item.meta?.ssl?.expiresAt ? new Date(item.meta.ssl.expiresAt) : null,
                sslDaysRemaining: item.meta?.ssl?.daysRemaining ?? null,
                sslIssuer: item.meta?.ssl?.issuer ?? null,
                sslSubject: item.meta?.ssl?.subject ?? null,
            }));

        const persisted = await persistAgentResults(prisma, agent.id, acceptedResults);
        acceptedCount += persisted.acceptedCount;
        duplicateCount += persisted.duplicateCount;
        failed.push(...persisted.failed);

        if (persisted.persistedKeys.length > 0) {
            const persistedKeySet = new Set(persisted.persistedKeys);
            const flappingService = new FlappingService(prisma);

            for (const result of acceptedResults) {
                if (!persistedKeySet.has(result.idempotencyKey)) {
                    continue;
                }

                const monitor = allowedMonitorMap.get(result.monitorId);
                if (!monitor) {
                    continue;
                }

                await flappingService.handleCheckResult(
                    monitor,
                    result.isUp,
                    result.error,
                    {
                        executorLabel: agent.name,
                        statusCode: result.statusCode,
                        responseTimeMs: result.responseTimeMs,
                        ssl: result.sslDaysRemaining !== undefined || result.sslExpiresAt || result.sslIssuer || result.sslSubject
                            ? {
                                expiresAt: result.sslExpiresAt ? result.sslExpiresAt.toISOString() : null,
                                daysRemaining: result.sslDaysRemaining ?? null,
                                issuer: result.sslIssuer ?? null,
                                subject: result.sslSubject ?? null,
                            }
                            : null,
                    }
                );
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
        config: {
            rateLimit: {
                max: 120,
                timeWindow: '1 minute',
            },
        },
    }, async (request, reply) => {
        const parse = heartbeatSchema.safeParse(request.body ?? {});
        if (!parse.success) {
            return reply.status(400).send({ error: 'Invalid payload', details: parse.error.issues });
        }

        const agent = request.agent!;
        const reportedVersion = parse.data.agentVersion?.trim() || null;
        const recoveredAt = new Date();
        const geo = resolveAgentGeo(request.ip);
        const currentAgent = await prisma.agent.findUnique({
            where: { id: agent.id },
            select: {
                lastSeen: true,
                status: true,
            },
        });

        if (!currentAgent) {
            return reply.status(401).send({ error: 'Agent not found' });
        }

        const updated = await prisma.agent.update({
            where: { id: agent.id },
            data: {
                ...(reportedVersion ? { agentVersion: reportedVersion } : {}),
                lastSeen: recoveredAt,
                lastSeenIp: geo.ip,
                lastSeenCountry: geo.country,
                lastSeenCity: geo.city,
                status: 'ONLINE',
            },
            select: {
                heartbeatIntervalSec: true,
            },
        });

        if (agent.status !== 'ONLINE') {
            await logAction('AGENT_ONLINE', null, { agentId: agent.id });
            await sendAgentOnlineNotifications(agent, currentAgent.lastSeen, recoveredAt);
        }

        return {
            now: recoveredAt.toISOString(),
            heartbeatIntervalSec: updated.heartbeatIntervalSec,
            commands: ['NONE'],
        };
    });
}
