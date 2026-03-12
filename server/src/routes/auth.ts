import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import { logAction } from '../services/auditService';
import { buildAuthCookie, buildClearedAuthCookie } from '../lib/authCookies';
import { authenticateJWT, SESSION_JWT_EXPIRES_IN } from '../lib/auth';
import { serverEnv } from '../lib/env';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_ERROR = 'Too many login attempts. Please try again later.';
const DUMMY_PASSWORD_HASH = '$2b$10$R9hN7VDaRao7IhiHBpjz5eEys3x6Z6GDZCBoBPXaG9q4CPGK/cHB2';
const LOGIN_IP_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_IP_MAX_FAILED_ATTEMPTS = 12;
const loginFailuresByIp = new Map<string, number[]>();

export function resetLoginAbuseTrackingForTests() {
    loginFailuresByIp.clear();
}

function normalizeLoginUsername(username: unknown): string {
    if (typeof username !== 'string') {
        return 'anonymous';
    }

    const normalized = username.trim().toLowerCase();
    return normalized || 'anonymous';
}

function getLoginRateLimitKey(request: { ip: string; body?: unknown }): string {
    const body = typeof request.body === 'object' && request.body !== null
        ? request.body as { username?: unknown }
        : {};

    return `${request.ip}:${normalizeLoginUsername(body.username)}`;
}

function pruneLoginFailures(ip: string, now = Date.now()): number[] {
    const attempts = loginFailuresByIp.get(ip) ?? [];
    const freshAttempts = attempts.filter((timestamp) => now - timestamp <= LOGIN_IP_WINDOW_MS);
    if (freshAttempts.length === 0) {
        loginFailuresByIp.delete(ip);
        return [];
    }

    loginFailuresByIp.set(ip, freshAttempts);
    return freshAttempts;
}

function recordFailedLoginIp(ip: string, now = Date.now()): number {
    const attempts = pruneLoginFailures(ip, now);
    attempts.push(now);
    loginFailuresByIp.set(ip, attempts);
    return attempts.length;
}

function isIpLoginBlocked(ip: string, now = Date.now()): boolean {
    return pruneLoginFailures(ip, now).length >= LOGIN_IP_MAX_FAILED_ATTEMPTS;
}

function logSecurityEvent(
    fastify: FastifyInstance,
    event: string,
    request: { ip: string },
    details: Record<string, unknown>
) {
    fastify.log.warn({
        event,
        securityEvent: true,
        ip: request.ip,
        ...details,
    }, event);
}

export default async function authRoutes(fastify: FastifyInstance) {
    fastify.post<{ Body: { username: string; password: string } }>(
        '/login',
        {
            config: {
                rateLimit: {
                    hook: 'preHandler',
                    max: 10,
                    timeWindow: '10 minutes',
                    ban: 20,
                    continueExceeding: true,
                    exponentialBackoff: true,
                    keyGenerator: getLoginRateLimitKey,
                    onExceeded: (request, key) => {
                        logSecurityEvent(fastify, 'SECURITY_LOGIN_RATE_LIMITED', request, { key });
                    },
                    onBanReach: (request, key) => {
                        logSecurityEvent(fastify, 'SECURITY_LOGIN_BANNED', request, { key });
                    },
                    errorResponseBuilder: (_request, context) => ({
                        statusCode: context.statusCode,
                        error: LOGIN_RATE_LIMIT_ERROR,
                    }),
                },
            },
        },
        async (request, reply) => {
            const username = request.body?.username?.trim();
            const password = request.body?.password;
            const nowMs = Date.now();

            if (!username || !password) {
                return reply.status(400).send({ error: 'Username and password are required' });
            }

            if (isIpLoginBlocked(request.ip, nowMs)) {
                logSecurityEvent(fastify, 'SECURITY_LOGIN_IP_BLOCKED', request, { username });
                return reply.status(429).send({
                    statusCode: 429,
                    error: LOGIN_RATE_LIMIT_ERROR,
                });
            }

            const user = await prisma.user.findUnique({
                where: { username },
            });

            if (!user) {
                await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
                await logAction('LOGIN_FAILED', null, { username }, request.ip);
                const failureCount = recordFailedLoginIp(request.ip, nowMs);
                logSecurityEvent(fastify, 'SECURITY_LOGIN_FAILED', request, {
                    username,
                    reason: 'invalid-credentials',
                    ipFailureCount: failureCount,
                });
                return reply.status(401).send({ error: 'Invalid credentials' });
            }

            const now = new Date();
            if (user.lockedUntil && user.lockedUntil > now) {
                await logAction('LOGIN_LOCKED', user.id, { username }, request.ip);
                logSecurityEvent(fastify, 'SECURITY_LOGIN_ACCOUNT_LOCKED', request, {
                    userId: user.id,
                    username,
                    lockedUntil: user.lockedUntil.toISOString(),
                });
                return reply.status(429).send({
                    statusCode: 429,
                    error: LOGIN_RATE_LIMIT_ERROR,
                });
            }

            const validPassword = await bcrypt.compare(password, user.passwordHash);
            if (!validPassword) {
                const nextFailedAttempts = user.failedLoginAttempts + 1;

                await logAction('LOGIN_FAILED', null, { username }, request.ip);
                const failureCount = recordFailedLoginIp(request.ip, nowMs);
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        failedLoginAttempts: nextFailedAttempts,
                        lockedUntil: nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
                            ? new Date(Date.now() + LOGIN_LOCKOUT_MS)
                            : null,
                    },
                });
                logSecurityEvent(fastify, 'SECURITY_LOGIN_FAILED', request, {
                    userId: user.id,
                    username,
                    reason: nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? 'account-locked' : 'invalid-credentials',
                    accountFailureCount: nextFailedAttempts,
                    ipFailureCount: failureCount,
                });

                return reply.status(401).send({ error: 'Invalid credentials' });
            }

            if (user.failedLoginAttempts > 0 || user.lockedUntil) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        failedLoginAttempts: 0,
                        lockedUntil: null,
                    },
                });
            }

            const token = fastify.jwt.sign({
                id: user.id,
                username: user.username,
                role: user.role,
                sessionVersion: user.sessionVersion,
            }, {
                expiresIn: SESSION_JWT_EXPIRES_IN,
            });
            reply.header('Set-Cookie', buildAuthCookie(token, serverEnv.nodeEnv === 'production'));

            await logAction('LOGIN', user.id, { username }, request.ip);

            return {
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                },
            };
        }
    );

    fastify.get('/me', {
        preHandler: [authenticateJWT],
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

    fastify.post('/logout', {
        preHandler: [authenticateJWT],
    }, async (request, reply) => {
        const user = request.user;

        await prisma.user.update({
            where: { id: user.id },
            data: {
                sessionVersion: { increment: 1 },
            },
        });

        await logAction('LOGOUT', user.id, { username: user.username }, request.ip);
        reply.header('Set-Cookie', buildClearedAuthCookie(serverEnv.nodeEnv === 'production'));
        return { success: true };
    });
}
