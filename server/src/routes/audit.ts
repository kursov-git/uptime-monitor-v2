import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { authenticateJWT, requireAdmin } from '../lib/auth';

export default async function auditRoutes(fastify: FastifyInstance) {
    // GET /api/audit — fetch audit logs with pagination (admin only)
    fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/', {
        preHandler: [authenticateJWT, requireAdmin],
    }, async (request, reply) => {
        const limit = Math.min(parseInt(request.query.limit || '50', 10), 200);
        const offset = parseInt(request.query.offset || '0', 10);

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                include: {
                    user: {
                        select: { username: true },
                    },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.auditLog.count(),
        ]);

        return { logs, total, limit, offset };
    });
}
