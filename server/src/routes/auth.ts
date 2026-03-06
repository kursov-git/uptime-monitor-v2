import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import { logAction } from '../services/auditService';

export default async function authRoutes(fastify: FastifyInstance) {
    // POST /api/auth/login
    fastify.post<{ Body: { username: string; password: string } }>(
        '/login',
        async (request, reply) => {
            const { username, password } = request.body;

            if (!username || !password) {
                return reply.status(400).send({ error: 'Username and password are required' });
            }

            const user = await prisma.user.findUnique({
                where: { username },
            });

            if (!user) {
                return reply.status(401).send({ error: 'Invalid credentials' });
            }

            const validPassword = await bcrypt.compare(password, user.passwordHash);
            if (!validPassword) {
                await logAction('LOGIN_FAILED', null, { username }, request.ip);
                return reply.status(401).send({ error: 'Invalid credentials' });
            }

            const token = fastify.jwt.sign({
                id: user.id,
                username: user.username,
                role: user.role,
            });

            await logAction('LOGIN', user.id, { username }, request.ip);

            return {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                },
            };
        }
    );

    // GET /api/auth/me — current user info
    fastify.get('/me', {
        preHandler: [async (request, reply) => {
            try {
                await request.jwtVerify();
            } catch {
                return reply.status(401).send({ error: 'Invalid token' });
            }
        }],
    }, async (request, reply) => {
        const payload = request.user;
        const user = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { id: true, username: true, role: true, createdAt: true },
        });

        if (!user) {
            return reply.status(404).send({ error: 'User not found' });
        }

        return user;
    });

    // POST /api/auth/logout — for audit trail
    fastify.post('/logout', {
        preHandler: [async (request, reply) => {
            try {
                await request.jwtVerify();
            } catch {
                return reply.status(401).send({ error: 'Invalid token' });
            }
        }],
    }, async (request) => {
        const user = request.user;
        await logAction('LOGOUT', user.id, { username: user.username }, request.ip);
        return { success: true };
    });
}
