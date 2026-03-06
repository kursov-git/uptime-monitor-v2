import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticateJWT, requireAdmin } from '../lib/auth';
import { TelegramNotifier } from '../services/telegram';
import { ZulipNotifier } from '../services/zulip';
import { encrypt, decrypt } from '../lib/crypto';

/** Mask a secret, showing only last 4 chars */
function maskSecret(value: string): string {
    if (value.length <= 4) return '****';
    return '*'.repeat(value.length - 4) + value.slice(-4);
}

export default async function notificationRoutes(fastify: FastifyInstance) {
    // GET /api/notifications/settings — get global settings
    fastify.get('/settings', {
        preHandler: [authenticateJWT, requireAdmin],
    }, async (request, reply) => {
        let settings = await prisma.notificationSettings.findFirst();
        if (!settings) {
            settings = await prisma.notificationSettings.create({ data: {} });
        }

        // Decrypt secrets before returning, mask tokens for security
        return {
            ...settings,
            telegramBotToken: settings.telegramBotToken
                ? maskSecret(decrypt(settings.telegramBotToken))
                : null,
            zulipApiKey: settings.zulipApiKey
                ? maskSecret(decrypt(settings.zulipApiKey))
                : null,
        };
    });

    // PUT /api/notifications/settings — update global settings
    fastify.put<{ Body: Record<string, unknown> }>('/settings', {
        preHandler: [authenticateJWT, requireAdmin],
    }, async (request, reply) => {
        let settings = await prisma.notificationSettings.findFirst();
        if (!settings) {
            settings = await prisma.notificationSettings.create({ data: {} });
        }

        // Whitelist allowed fields to prevent mass assignment
        const body = request.body;
        const data: Record<string, unknown> = {};
        const allowedFields = [
            'telegramEnabled', 'telegramBotToken', 'telegramChatId',
            'zulipEnabled', 'zulipBotEmail', 'zulipApiKey', 'zulipServerUrl',
            'zulipStream', 'zulipTopic',
            'flappingFailCount', 'flappingIntervalSec', 'retentionDays',
        ] as const;
        for (const key of allowedFields) {
            if (key in body) data[key] = body[key];
        }

        // Encrypt sensitive fields before writing
        if (typeof data.telegramBotToken === 'string' && data.telegramBotToken) {
            if (data.telegramBotToken.includes('****')) {
                delete data.telegramBotToken;
            } else {
                data.telegramBotToken = encrypt(data.telegramBotToken);
            }
        }
        if (typeof data.zulipApiKey === 'string' && data.zulipApiKey) {
            if (data.zulipApiKey.includes('****')) {
                delete data.zulipApiKey;
            } else {
                data.zulipApiKey = encrypt(data.zulipApiKey);
            }
        }

        const updated = await prisma.notificationSettings.update({
            where: { id: settings.id },
            data,
        });

        return updated;
    });

    // POST /api/notifications/test/telegram — send test message
    fastify.post<{ Body: { botToken: string; chatId: string } }>(
        '/test/telegram',
        { preHandler: [authenticateJWT, requireAdmin] },
        async (request, reply) => {
            let { botToken, chatId } = request.body;

            if (!botToken || !chatId) {
                return reply.status(400).send({ error: 'botToken and chatId are required' });
            }

            if (botToken.includes('****')) {
                const settings = await prisma.notificationSettings.findFirst();
                if (settings?.telegramBotToken) {
                    botToken = decrypt(settings.telegramBotToken);
                }
            }

            const notifier = new TelegramNotifier();
            const result = await notifier.send(
                { botToken, chatId },
                '🧪 Test message from Uptime Monitor',
                1 // no retry for test messages
            );

            await prisma.notificationHistory.create({
                data: {
                    monitorId: null,
                    channel: 'TELEGRAM',
                    status: result.success ? 'SUCCESS' : 'FAILED',
                    error: result.error || null,
                }
            });

            return result;
        }
    );

    // POST /api/notifications/test/zulip — send test message
    fastify.post<{ Body: { botEmail: string; apiKey: string; serverUrl: string; stream: string; topic: string } }>(
        '/test/zulip',
        { preHandler: [authenticateJWT, requireAdmin] },
        async (request, reply) => {
            let { botEmail, apiKey, serverUrl, stream, topic } = request.body;

            if (!botEmail || !apiKey || !serverUrl || !stream || !topic) {
                return reply.status(400).send({ error: 'All Zulip fields are required' });
            }

            if (apiKey.includes('****')) {
                const settings = await prisma.notificationSettings.findFirst();
                if (settings?.zulipApiKey) {
                    apiKey = decrypt(settings.zulipApiKey);
                }
            }

            const notifier = new ZulipNotifier();
            const result = await notifier.send(
                { botEmail, apiKey, serverUrl, stream, topic },
                '🧪 Test message from Uptime Monitor',
                1 // no retry for test messages
            );

            await prisma.notificationHistory.create({
                data: {
                    monitorId: null,
                    channel: 'ZULIP',
                    status: result.success ? 'SUCCESS' : 'FAILED',
                    error: result.error || null,
                }
            });

            return result;
        }
    );

    // GET /api/notifications/history — get paginated notification history
    fastify.get<{ Querystring: { page?: string, limit?: string, monitorId?: string } }>(
        '/history',
        { preHandler: [authenticateJWT, requireAdmin] },
        async (request, reply) => {
            const page = parseInt(request.query.page || '1', 10);
            const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
            const monitorId = request.query.monitorId;
            const skip = (page - 1) * limit;

            const whereClause = monitorId ? { monitorId } : {};

            const [total, history] = await Promise.all([
                prisma.notificationHistory.count({ where: whereClause }),
                prisma.notificationHistory.findMany({
                    where: whereClause,
                    orderBy: { timestamp: 'desc' },
                    skip,
                    take: limit,
                })
            ]);

            return {
                history,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                }
            };
        }
    );

    // GET /api/monitors/:id/notifications — get per-monitor overrides
    fastify.get<{ Params: { monitorId: string } }>(
        '/monitors/:monitorId',
        { preHandler: [authenticateJWT, requireAdmin] },
        async (request, reply) => {
            const override = await prisma.monitorNotificationOverride.findUnique({
                where: { monitorId: request.params.monitorId },
            });
            return override || null;
        }
    );

    // PUT /api/monitors/:id/notifications — update per-monitor overrides
    fastify.put<{ Params: { monitorId: string }; Body: Record<string, unknown> }>(
        '/monitors/:monitorId',
        { preHandler: [authenticateJWT, requireAdmin] },
        async (request, reply) => {
            const { monitorId } = request.params;

            // Whitelist allowed override fields
            const body = request.body;
            const data: Record<string, unknown> = {};
            const allowedOverrides = [
                'telegramEnabled', 'telegramChatId',
                'zulipEnabled', 'zulipStream', 'zulipTopic',
                'flappingFailCount', 'flappingIntervalSec',
            ] as const;
            for (const key of allowedOverrides) {
                if (key in body) data[key] = body[key];
            }

            const existing = await prisma.monitorNotificationOverride.findUnique({
                where: { monitorId },
            });

            if (existing) {
                const updated = await prisma.monitorNotificationOverride.update({
                    where: { monitorId },
                    data,
                });
                return updated;
            } else {
                const created = await prisma.monitorNotificationOverride.create({
                    data: {
                        monitorId,
                        ...data,
                    },
                });
                return created;
            }
        }
    );
}
