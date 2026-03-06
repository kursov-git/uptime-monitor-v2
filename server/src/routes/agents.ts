import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticateJWT, blockApiKeyWrites, requireAdmin } from '../lib/auth';
import { hashAgentToken } from '../services/agentAuth';
import { logAction } from '../services/auditService';

const createSchema = z.object({
    name: z.string().min(2).max(128),
    heartbeatIntervalSec: z.number().int().min(5).max(600).optional(),
    offlineAfterSec: z.number().int().min(10).max(3600).optional(),
});

const updateSchema = z.object({
    name: z.string().min(2).max(128).optional(),
    heartbeatIntervalSec: z.number().int().min(5).max(600).optional(),
    offlineAfterSec: z.number().int().min(10).max(3600).optional(),
});

function generateAgentToken(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export default async function agentsRoutes(fastify: FastifyInstance) {
    fastify.get('/', {
        preHandler: [authenticateJWT, requireAdmin],
    }, async () => {
        return prisma.agent.findMany({
            select: {
                id: true,
                name: true,
                status: true,
                heartbeatIntervalSec: true,
                offlineAfterSec: true,
                lastSeen: true,
                revokedAt: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        monitors: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    });

    fastify.post('/', {
        preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin],
    }, async (request, reply) => {
        const parse = createSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ error: 'Invalid payload', details: parse.error.issues });
        }

        const token = generateAgentToken();
        const tokenHash = hashAgentToken(token);

        const agent = await prisma.agent.create({
            data: {
                name: parse.data.name,
                tokenHash,
                heartbeatIntervalSec: parse.data.heartbeatIntervalSec ?? 30,
                offlineAfterSec: parse.data.offlineAfterSec ?? 90,
            },
            select: {
                id: true,
                name: true,
                status: true,
                heartbeatIntervalSec: true,
                offlineAfterSec: true,
                lastSeen: true,
                revokedAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        await logAction('AGENT_CREATED', request.user?.id, { agentId: agent.id, name: agent.name }, request.ip);

        return reply.status(201).send({
            agent,
            token,
        });
    });

    fastify.patch<{ Params: { id: string } }>('/:id', {
        preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin],
    }, async (request, reply) => {
        const parse = updateSchema.safeParse(request.body);
        if (!parse.success) {
            return reply.status(400).send({ error: 'Invalid payload', details: parse.error.issues });
        }

        const { id } = request.params;
        const existing = await prisma.agent.findUnique({ where: { id } });
        if (!existing) {
            return reply.status(404).send({ error: 'Agent not found' });
        }

        const updated = await prisma.agent.update({
            where: { id },
            data: parse.data,
            select: {
                id: true,
                name: true,
                status: true,
                heartbeatIntervalSec: true,
                offlineAfterSec: true,
                lastSeen: true,
                revokedAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        await logAction('AGENT_UPDATED', request.user?.id, { agentId: id }, request.ip);

        return updated;
    });

    fastify.post<{ Params: { id: string } }>('/:id/rotate-token', {
        preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin],
    }, async (request, reply) => {
        const { id } = request.params;
        const existing = await prisma.agent.findUnique({ where: { id } });
        if (!existing) {
            return reply.status(404).send({ error: 'Agent not found' });
        }

        const token = generateAgentToken();
        const tokenHash = hashAgentToken(token);

        await prisma.agent.update({
            where: { id },
            data: {
                tokenHash,
                revokedAt: null,
            },
        });

        await logAction('AGENT_TOKEN_ROTATED', request.user?.id, { agentId: id }, request.ip);

        return { token };
    });

    fastify.post<{ Params: { id: string } }>('/:id/revoke', {
        preHandler: [authenticateJWT, blockApiKeyWrites, requireAdmin],
    }, async (request, reply) => {
        const { id } = request.params;
        const existing = await prisma.agent.findUnique({ where: { id } });
        if (!existing) {
            return reply.status(404).send({ error: 'Agent not found' });
        }

        const revoked = await prisma.agent.update({
            where: { id },
            data: {
                revokedAt: new Date(),
                status: 'OFFLINE',
            },
            select: {
                id: true,
                revokedAt: true,
                status: true,
            },
        });

        await logAction('AGENT_REVOKED', request.user?.id, { agentId: id }, request.ip);

        return revoked;
    });
}
