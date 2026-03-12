import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticateJWT, authenticateSseJWT, requireAdmin, blockApiKeyWrites } from '../lib/auth';
import { validateMonitorInputWithOptions, CreateMonitorBody } from '../lib/validation';
import { logAction } from '../services/auditService';
import { FlappingService } from '../services/flapping';
import { sseService } from '../services/sse';
import { agentSseService } from '../services/agentSse';
import { encrypt, decrypt } from '../lib/crypto';
import { serverEnv } from '../lib/env';

export default async function monitorRoutes(fastify: FastifyInstance) {
    // GET /api/monitors/stream — Server-Sent Events for monitor updates
    fastify.get('/stream', {
        preHandler: [authenticateSseJWT],
    }, async (request, reply) => {
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.flushHeaders();

        const added = sseService.addClient(reply);
        if (!added) {
            return reply.status(503).send({ error: 'Too many SSE connections' });
        }

        // Send a connected event to verify it works
        reply.raw.write(`event: connected\ndata: {"status": "ok"}\n\n`);

        // Keep the request open
        return reply.hijack();
    });


    // GET /api/monitors — list all monitors (auth required)
    fastify.get('/', {
        preHandler: [authenticateJWT],
    }, async (request, reply) => {
        const monitors = await prisma.monitor.findMany({
            include: {
                agent: {
                    select: { id: true, name: true },
                },
                checkResults: {
                    orderBy: { timestamp: 'desc' },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const result = monitors.map(m => {
            const state = FlappingService.getDiagnosticState(m.id);
            const isFlapping = state ? state.consecutiveFailures > 0 && !state.notified : false;

            return {
                ...m,
                agentName: m.agent?.name || null,
                lastCheck: m.checkResults[0] || null,
                checkResults: undefined,
                flappingState: state ? {
                    isFlapping,
                    consecutiveFailures: state.consecutiveFailures,
                    firstFailureTime: state.firstFailureTime ? new Date(state.firstFailureTime).toISOString() : null,
                    lastError: state.lastError,
                } : null,
            };
        });

        return result;
    });

    // GET /api/monitors/:id — single monitor with stats
    fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
        '/:id',
        { preHandler: [authenticateJWT] },
        async (request, reply) => {
            const { id } = request.params;

            const limit = Math.min(parseInt(request.query.limit || '100', 10), 1000);

            const monitor = await prisma.monitor.findUnique({
                where: { id },
                include: {
                checkResults: {
                    orderBy: { timestamp: 'desc' },
                    take: limit,
                },
                agent: {
                    select: { id: true, name: true },
                },
            },
        });

            if (!monitor) {
                return reply.status(404).send({ error: 'Monitor not found' });
            }

            const state = FlappingService.getDiagnosticState(monitor.id);
            const isFlapping = state ? state.consecutiveFailures > 0 && !state.notified : false;

            return {
                ...monitor,
                agentName: monitor.agent?.name || null,
                flappingState: state ? {
                    isFlapping,
                    consecutiveFailures: state.consecutiveFailures,
                    firstFailureTime: state.firstFailureTime ? new Date(state.firstFailureTime).toISOString() : null,
                    lastError: state.lastError,
                } : null,
            };
        }
    );

    // GET /api/monitors/:id/stats — monitor history
    fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string; from?: string; to?: string } }>(
        '/:id/stats',
        { preHandler: [authenticateJWT] },
        async (request, reply) => {
            const { id } = request.params;

            const limit = Math.min(parseInt(request.query.limit || '100', 10), 1000);
            const offset = parseInt(request.query.offset || '0', 10);
            const { from, to } = request.query;

            const whereClause: any = { monitorId: id };
            if (from || to) {
                whereClause.timestamp = {};
                if (from) {
                    whereClause.timestamp.gte = /^\d+$/.test(from) ? new Date(parseInt(from, 10)) : new Date(from);
                }
                if (to) {
                    whereClause.timestamp.lte = /^\d+$/.test(to) ? new Date(parseInt(to, 10)) : new Date(to);
                }
            }

            const [results, total, upCount, avgRes] = await Promise.all([
                prisma.checkResult.findMany({
                    where: whereClause,
                    orderBy: { timestamp: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma.checkResult.count({ where: whereClause }),
                prisma.checkResult.count({ where: { ...whereClause, isUp: true } }),
                prisma.checkResult.aggregate({
                    where: whereClause,
                    _avg: { responseTimeMs: true },
                }),
            ]);

            const overallUptimePercent = total > 0 ? ((upCount / total) * 100).toFixed(1) : '—';
            const overallAvgResponseMs = avgRes._avg.responseTimeMs ? Math.round(avgRes._avg.responseTimeMs) : 0;

            return { results, total, limit, offset, overallUptimePercent, overallAvgResponseMs };
        }
    );

    // POST /api/monitors — create monitor (admin only)
    fastify.post<{ Body: CreateMonitorBody }>('/', {
        preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin],
    }, async (request, reply) => {
        const errors = validateMonitorInputWithOptions(request.body, {
            allowPrivateTargets: serverEnv.allowPrivateMonitorTargets,
        });
        if (errors.length > 0) {
            return reply.status(400).send({ errors });
        }

        const { name, url, agentId, method, intervalSeconds, timeoutSeconds, expectedStatus, expectedBody, headers, authMethod, authUrl, authPayload, authTokenRegex } = request.body;

        const monitor = await prisma.monitor.create({
            data: {
                name: name.trim(),
                url: url.trim(),
                agentId: agentId === undefined ? null : agentId,
                method: method || 'GET',
                intervalSeconds: intervalSeconds || 60,
                timeoutSeconds: timeoutSeconds || 30,
                expectedStatus: expectedStatus || 200,
                expectedBody: expectedBody || null,
                headers: headers || null,
                authMethod: authMethod || 'NONE',
                authUrl: authUrl || null,
                authPayload: authPayload ? encrypt(authPayload) : null,
                authTokenRegex: authTokenRegex || null,
            },
        });


        const user = request.user;
        await logAction('CREATE_MONITOR', user?.id, { monitorId: monitor.id, name: monitor.name }, request.ip);
        if (monitor.agentId) {
            agentSseService.publish('monitor.upsert', { monitorId: monitor.id, agentId: monitor.agentId });
        }

        return reply.status(201).send(monitor);
    });

    // PUT /api/monitors/:id — update monitor (admin only)
    fastify.put<{ Params: { id: string }; Body: Partial<CreateMonitorBody> }>(
        '/:id',
        { preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin] },
        async (request, reply) => {
            const { id } = request.params;

            const existing = await prisma.monitor.findUnique({ where: { id } });
            if (!existing) {
                return reply.status(404).send({ error: 'Monitor not found' });
            }

            const body = request.body;
            const errors = validateMonitorInputWithOptions({
                name: body.name ?? existing.name,
                url: body.url ?? existing.url,
                method: body.method ?? existing.method,
                intervalSeconds: body.intervalSeconds ?? existing.intervalSeconds,
                timeoutSeconds: body.timeoutSeconds ?? existing.timeoutSeconds,
                expectedStatus: body.expectedStatus ?? existing.expectedStatus,
                expectedBody: body.expectedBody ?? existing.expectedBody ?? undefined,
                headers: body.headers ?? existing.headers ?? undefined,
                authMethod: body.authMethod ?? existing.authMethod,
                authUrl: body.authUrl ?? existing.authUrl ?? undefined,
                authPayload: body.authPayload ?? (existing.authPayload ? decrypt(existing.authPayload) : undefined),
                authTokenRegex: body.authTokenRegex ?? existing.authTokenRegex ?? undefined,
                agentId: body.agentId ?? existing.agentId,
            }, {
                allowPrivateTargets: serverEnv.allowPrivateMonitorTargets,
            });
            if (errors.length > 0) {
                return reply.status(400).send({ errors });
            }

            const monitor = await prisma.monitor.update({
                where: { id },
                data: {
                    ...(body.name !== undefined && { name: body.name.trim() }),
                    ...(body.url !== undefined && { url: body.url.trim() }),
                    ...(body.agentId !== undefined && { agentId: body.agentId }),
                    ...(body.method !== undefined && { method: body.method }),
                    ...(body.intervalSeconds !== undefined && { intervalSeconds: body.intervalSeconds }),
                    ...(body.timeoutSeconds !== undefined && { timeoutSeconds: body.timeoutSeconds }),
                    ...(body.expectedStatus !== undefined && { expectedStatus: body.expectedStatus }),
                    ...(body.expectedBody !== undefined && { expectedBody: body.expectedBody }),
                    ...(body.headers !== undefined && { headers: body.headers }),
                    ...(body.authMethod !== undefined && { authMethod: body.authMethod }),
                    ...(body.authUrl !== undefined && { authUrl: body.authUrl }),
                    ...(body.authPayload !== undefined && { authPayload: body.authPayload ? encrypt(body.authPayload) : body.authPayload }),
                    ...(body.authTokenRegex !== undefined && { authTokenRegex: body.authTokenRegex }),
                },
            });

            const user = request.user;
            await logAction('UPDATE_MONITOR', user?.id, { monitorId: monitor.id, name: monitor.name }, request.ip);
            if (existing.agentId && existing.agentId !== monitor.agentId) {
                agentSseService.publish('monitor.delete', { monitorId: monitor.id, agentId: existing.agentId });
            }
            if (monitor.agentId) {
                agentSseService.publish('monitor.upsert', { monitorId: monitor.id, agentId: monitor.agentId });
            }

            return monitor;
        }
    );

    // PATCH /api/monitors/:id/toggle — pause/resume (admin only)
    fastify.patch<{ Params: { id: string } }>(
        '/:id/toggle',
        { preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin] },
        async (request, reply) => {
            const { id } = request.params;

            const existing = await prisma.monitor.findUnique({ where: { id } });
            if (!existing) {
                return reply.status(404).send({ error: 'Monitor not found' });
            }

            const monitor = await prisma.monitor.update({
                where: { id },
                data: { isActive: !existing.isActive },
            });

            const user = request.user;
            const action = monitor.isActive ? 'RESUME_MONITOR' : 'PAUSE_MONITOR';
            await logAction(action, user?.id, { monitorId: monitor.id, name: monitor.name }, request.ip);
            if (monitor.agentId) {
                if (monitor.isActive) {
                    agentSseService.publish('monitor.upsert', { monitorId: monitor.id, agentId: monitor.agentId });
                } else {
                    agentSseService.publish('monitor.delete', { monitorId: monitor.id, agentId: monitor.agentId });
                }
            }

            return monitor;
        }
    );

    fastify.patch<{ Params: { id: string }; Body: { isPublic?: boolean } }>(
        '/:id/public',
        { preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin] },
        async (request, reply) => {
            const { id } = request.params;
            if (typeof request.body?.isPublic !== 'boolean') {
                return reply.status(400).send({ error: 'isPublic boolean is required' });
            }

            const existing = await prisma.monitor.findUnique({ where: { id } });
            if (!existing) {
                return reply.status(404).send({ error: 'Monitor not found' });
            }

            const monitor = await prisma.monitor.update({
                where: { id },
                data: { isPublic: request.body.isPublic },
            });

            await logAction(
                request.body.isPublic ? 'PUBLISH_MONITOR' : 'UNPUBLISH_MONITOR',
                request.user?.id,
                { monitorId: monitor.id, name: monitor.name },
                request.ip
            );

            return monitor;
        }
    );

    // DELETE /api/monitors/:id — delete monitor (admin only)
    fastify.delete<{ Params: { id: string } }>(
        '/:id',
        { preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin] },
        async (request, reply) => {
            const { id } = request.params;

            const existing = await prisma.monitor.findUnique({ where: { id } });
            if (!existing) {
                return reply.status(404).send({ error: 'Monitor not found' });
            }

            await prisma.monitor.delete({ where: { id } });

            const user = request.user;
            await logAction('DELETE_MONITOR', user?.id, { monitorId: existing.id, name: existing.name }, request.ip);
            if (existing.agentId) {
                agentSseService.publish('monitor.delete', { monitorId: existing.id, agentId: existing.agentId });
            }

            return { success: true };
        }
    );
}
