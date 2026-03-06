import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import { authenticateJWT, requireAdmin } from '../lib/auth';
import { logAction } from '../services/auditService';

export default async function userRoutes(fastify: FastifyInstance) {
    // GET /api/users — list all users (admin only)
    fastify.get('/', {
        preHandler: [authenticateJWT, requireAdmin],
    }, async (request, reply) => {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                role: true,
                createdAt: true,
                apiKey: {
                    select: {
                        id: true,
                        key: true,
                        createdAt: true,
                        revokedAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        return users;
    });

    // POST /api/users — create user (admin only)
    fastify.post<{ Body: { username: string; password: string; role?: string } }>('/', {
        preHandler: [authenticateJWT, requireAdmin],
    }, async (request, reply) => {
        const { username, password, role } = request.body;

        if (!username || !password) {
            return reply.status(400).send({ error: 'Username and password are required' });
        }

        if (username.length < 3) {
            return reply.status(400).send({ error: 'Username must be at least 3 characters' });
        }

        if (password.length < 6) {
            return reply.status(400).send({ error: 'Password must be at least 6 characters' });
        }

        // Check uniqueness
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return reply.status(409).send({ error: 'Username already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                username,
                passwordHash,
                role: role === 'ADMIN' ? 'ADMIN' : 'VIEWER',
            },
            select: {
                id: true,
                username: true,
                role: true,
                createdAt: true,
            },
        });

        const currentUser = request.user;
        await logAction('CREATE_USER', currentUser.id, { newUser: username, role: user.role }, request.ip);

        return reply.status(201).send(user);
    });

    // DELETE /api/users/:id — delete user (admin only)
    fastify.delete<{ Params: { id: string } }>('/:id', {
        preHandler: [authenticateJWT, requireAdmin],
    }, async (request, reply) => {
        const { id } = request.params;
        const currentUser = request.user;

        // Prevent self-deletion
        if (id === currentUser.id) {
            return reply.status(400).send({ error: 'Cannot delete yourself' });
        }

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            return reply.status(404).send({ error: 'User not found' });
        }

        await prisma.user.delete({ where: { id } });

        await logAction('DELETE_USER', currentUser.id, { deletedUser: user.username }, request.ip);

        return { success: true };
    });

    // PATCH /api/users/:id/password — change password (admin only)
    fastify.patch<{ Params: { id: string }; Body: { password: string } }>(
        '/:id/password',
        { preHandler: [authenticateJWT, requireAdmin] },
        async (request, reply) => {
            const { id } = request.params;
            const { password } = request.body;

            if (!password || password.length < 6) {
                return reply.status(400).send({ error: 'Password must be at least 6 characters' });
            }

            const user = await prisma.user.findUnique({ where: { id } });
            if (!user) {
                return reply.status(404).send({ error: 'User not found' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            await prisma.user.update({
                where: { id },
                data: { passwordHash },
            });

            const currentUser = request.user;
            await logAction('PASSWORD_CHANGED', currentUser.id, { targetUser: user.username }, request.ip);

            return { success: true };
        }
    );
}
