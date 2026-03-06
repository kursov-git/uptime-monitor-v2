import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import crypto from 'crypto';
import { authenticateJWT } from '../lib/auth';
import { logAction } from '../services/auditService';

export default async function apikeyRoutes(fastify: FastifyInstance) {
    // GET /api/apikeys/me — get current user's API key
    fastify.get('/me', {
        preHandler: [authenticateJWT],
    }, async (request, reply) => {
        const user = request.user;

        const apiKey = await prisma.apiKey.findUnique({
            where: { userId: user.id },
        });

        return apiKey || null;
    });

    // POST /api/apikeys/generate — generate new API key
    fastify.post('/generate', {
        preHandler: [authenticateJWT],
    }, async (request, reply) => {
        const user = request.user;

        // Revoke existing key if any
        const existing = await prisma.apiKey.findUnique({
            where: { userId: user.id },
        });

        if (existing && !existing.revokedAt) {
            await prisma.apiKey.update({
                where: { id: existing.id },
                data: { revokedAt: new Date() },
            });
        }

        // Generate new key
        const key = `um_${crypto.randomBytes(32).toString('hex')}`;

        const apiKey = await prisma.apiKey.create({
            data: {
                key,
                userId: user.id,
            },
        });

        await logAction('GENERATE_API_KEY', user.id, {}, request.ip);

        return apiKey;
    });

    // DELETE /api/apikeys/revoke — revoke API key
    fastify.delete('/revoke', {
        preHandler: [authenticateJWT],
    }, async (request, reply) => {
        const user = request.user;

        const apiKey = await prisma.apiKey.findUnique({
            where: { userId: user.id },
        });

        if (!apiKey) {
            return reply.status(404).send({ error: 'No API key found' });
        }

        if (apiKey.revokedAt) {
            return reply.status(400).send({ error: 'API key already revoked' });
        }

        await prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { revokedAt: new Date() },
        });

        await logAction('REVOKE_API_KEY', user.id, {}, request.ip);

        return { success: true };
    });
}
