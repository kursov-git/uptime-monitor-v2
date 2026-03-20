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
    const normalizeMonitorType = (type: string | undefined) => String(type || 'HTTP').toUpperCase();
    const normalizeDnsRecordType = (dnsRecordType: string | undefined) => String(dnsRecordType || 'A').toUpperCase();
    const normalizeRequestBody = (method: string | undefined, requestBody: string | null | undefined) => {
        const normalizedMethod = String(method || 'GET').toUpperCase();
        if (['GET', 'HEAD'].includes(normalizedMethod)) {
            return null;
        }

        return requestBody && requestBody.length > 0 ? requestBody : null;
    };

    const buildMonitorData = (input: {
        type: string;
        url: string;
        serviceName?: string | null;
        method?: string | null;
        intervalSeconds?: number | null;
        timeoutSeconds?: number | null;
        expectedStatus?: number | null;
        expectedBody?: string | null;
        requestBody?: string | null;
        bodyAssertionType?: string | null;
        bodyAssertionPath?: string | null;
        headers?: string | null;
        authMethod?: string | null;
        authUrl?: string | null;
        authPayload?: string | null;
        authTokenRegex?: string | null;
        sslExpiryEnabled?: boolean | null;
        sslExpiryThresholdDays?: number | null;
        dnsRecordType?: string | null;
        agentId?: string | null;
        name: string;
    }) => {
        const type = normalizeMonitorType(input.type);
        const intervalSeconds = input.intervalSeconds ?? 60;
        const timeoutSeconds = input.timeoutSeconds ?? 30;
        const serviceName = input.serviceName?.trim() ? input.serviceName.trim() : null;

        if (type === 'TCP') {
            return {
                name: input.name.trim(),
                serviceName,
                type,
                url: input.url.trim(),
                dnsRecordType: 'A',
                agentId: input.agentId === undefined ? null : input.agentId,
                method: 'GET',
                intervalSeconds,
                timeoutSeconds,
                expectedStatus: 200,
                expectedBody: null,
                requestBody: null,
                bodyAssertionType: 'NONE',
                bodyAssertionPath: null,
                headers: null,
                authMethod: 'NONE',
                authUrl: null,
                authPayload: null,
                authTokenRegex: null,
                sslExpiryEnabled: false,
                sslExpiryThresholdDays: 14,
            };
        }

        if (type === 'DNS') {
            return {
                name: input.name.trim(),
                serviceName,
                type,
                url: input.url.trim(),
                dnsRecordType: normalizeDnsRecordType(input.dnsRecordType ?? undefined),
                agentId: input.agentId === undefined ? null : input.agentId,
                method: 'GET',
                intervalSeconds,
                timeoutSeconds,
                expectedStatus: 200,
                expectedBody: input.expectedBody || null,
                requestBody: null,
                bodyAssertionType: 'NONE',
                bodyAssertionPath: null,
                headers: null,
                authMethod: 'NONE',
                authUrl: null,
                authPayload: null,
                authTokenRegex: null,
                sslExpiryEnabled: false,
                sslExpiryThresholdDays: 14,
            };
        }

        const normalizedMethod = String(input.method || 'GET').toUpperCase();
        return {
            name: input.name.trim(),
            serviceName,
            type,
            url: input.url.trim(),
            dnsRecordType: 'A',
            agentId: input.agentId === undefined ? null : input.agentId,
            method: normalizedMethod,
            intervalSeconds,
            timeoutSeconds,
            expectedStatus: input.expectedStatus ?? 200,
            expectedBody: input.expectedBody || null,
            requestBody: normalizeRequestBody(normalizedMethod, input.requestBody),
            bodyAssertionType: input.bodyAssertionType || (input.expectedBody ? 'AUTO' : 'NONE'),
            bodyAssertionPath: input.bodyAssertionPath || null,
            headers: input.headers || null,
            authMethod: input.authMethod || 'NONE',
            authUrl: input.authUrl || null,
            authPayload: input.authPayload ? encrypt(input.authPayload) : null,
            authTokenRegex: input.authTokenRegex || null,
            sslExpiryEnabled: input.sslExpiryEnabled || false,
            sslExpiryThresholdDays: input.sslExpiryThresholdDays || 14,
        };
    };

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
                requestBody: m.requestBody ?? null,
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
                requestBody: monitor.requestBody ?? null,
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

        const {
            name,
            serviceName,
            type,
            url,
            dnsRecordType,
            agentId,
            method,
            intervalSeconds,
            timeoutSeconds,
            expectedStatus,
            expectedBody,
            requestBody,
            bodyAssertionType,
            bodyAssertionPath,
            headers,
            authMethod,
            authUrl,
            authPayload,
            authTokenRegex,
            sslExpiryEnabled,
            sslExpiryThresholdDays,
        } = request.body;
        const monitor = await prisma.monitor.create({
            data: buildMonitorData({
                name,
                serviceName,
                type: type || 'HTTP',
                url,
                dnsRecordType,
                agentId,
                method,
                intervalSeconds,
                timeoutSeconds,
                expectedStatus,
                expectedBody,
                requestBody,
                bodyAssertionType,
                bodyAssertionPath,
                headers,
                authMethod,
                authUrl,
                authPayload,
                authTokenRegex,
                sslExpiryEnabled,
                sslExpiryThresholdDays,
            }),
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
                serviceName: body.serviceName ?? existing.serviceName ?? undefined,
                type: body.type ?? existing.type,
                url: body.url ?? existing.url,
                dnsRecordType: body.dnsRecordType ?? existing.dnsRecordType,
                method: body.method ?? existing.method,
                intervalSeconds: body.intervalSeconds ?? existing.intervalSeconds,
                timeoutSeconds: body.timeoutSeconds ?? existing.timeoutSeconds,
                expectedStatus: body.expectedStatus ?? existing.expectedStatus,
                expectedBody: body.expectedBody ?? existing.expectedBody ?? undefined,
                requestBody: body.requestBody ?? existing.requestBody ?? undefined,
                bodyAssertionType: body.bodyAssertionType ?? existing.bodyAssertionType,
                bodyAssertionPath: body.bodyAssertionPath ?? existing.bodyAssertionPath ?? undefined,
                headers: body.headers ?? existing.headers ?? undefined,
                authMethod: body.authMethod ?? existing.authMethod,
                authUrl: body.authUrl ?? existing.authUrl ?? undefined,
                authPayload: body.authPayload ?? (existing.authPayload ? decrypt(existing.authPayload) : undefined),
                authTokenRegex: body.authTokenRegex ?? existing.authTokenRegex ?? undefined,
                sslExpiryEnabled: body.sslExpiryEnabled ?? existing.sslExpiryEnabled,
                sslExpiryThresholdDays: body.sslExpiryThresholdDays ?? existing.sslExpiryThresholdDays,
                agentId: body.agentId !== undefined ? body.agentId : existing.agentId,
            }, {
                allowPrivateTargets: serverEnv.allowPrivateMonitorTargets,
            });
            if (errors.length > 0) {
                return reply.status(400).send({ errors });
            }

            const monitor = await prisma.monitor.update({
                where: { id },
                data: buildMonitorData({
                    name: body.name ?? existing.name,
                    serviceName: body.serviceName ?? existing.serviceName,
                    type: body.type ?? existing.type,
                    url: body.url ?? existing.url,
                    dnsRecordType: body.dnsRecordType ?? existing.dnsRecordType,
                    agentId: body.agentId !== undefined ? body.agentId : existing.agentId,
                    method: body.method ?? existing.method,
                    intervalSeconds: body.intervalSeconds ?? existing.intervalSeconds,
                    timeoutSeconds: body.timeoutSeconds ?? existing.timeoutSeconds,
                    expectedStatus: body.expectedStatus ?? existing.expectedStatus,
                    expectedBody: body.expectedBody ?? existing.expectedBody,
                    requestBody: body.requestBody ?? existing.requestBody,
                    bodyAssertionType: body.bodyAssertionType ?? existing.bodyAssertionType,
                    bodyAssertionPath: body.bodyAssertionPath ?? existing.bodyAssertionPath,
                    headers: body.headers ?? existing.headers,
                    authMethod: body.authMethod ?? existing.authMethod,
                    authUrl: body.authUrl ?? existing.authUrl,
                    authPayload: body.authPayload ?? (existing.authPayload ? decrypt(existing.authPayload) : null),
                    authTokenRegex: body.authTokenRegex ?? existing.authTokenRegex,
                    sslExpiryEnabled: body.sslExpiryEnabled ?? existing.sslExpiryEnabled,
                    sslExpiryThresholdDays: body.sslExpiryThresholdDays ?? existing.sslExpiryThresholdDays,
                }),
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
