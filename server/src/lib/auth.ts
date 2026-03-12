import { FastifyRequest, FastifyReply } from 'fastify';
import { Role } from '@uptime-monitor/shared';
import prisma from './prisma';
import { authenticateApiKey } from '../services/apiKeys';
import { AUTH_COOKIE_MAX_AGE_SEC, getAuthCookieToken } from './authCookies';

// JWT payload interface
export interface JwtPayload {
    id: string;
    username: string;
    role: Role;
    sessionVersion?: number;
    isApiKey?: boolean;
}

export const SESSION_JWT_EXPIRES_IN = `${AUTH_COOKIE_MAX_AGE_SEC}s`;

// Type request.user via @fastify/jwt's built-in declaration merging
declare module '@fastify/jwt' {
    interface FastifyJWT {
        user: JwtPayload;
    }
}

// Authenticate JWT token
export async function authenticateJWT(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    try {
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice('Bearer '.length);
            const user = await authenticateSessionToken(request, token);
            if (!user) {
                return reply.status(401).send({ error: 'Invalid token' });
            }
            request.user = user;
            return;
        }

        const cookieToken = getAuthCookieToken(request);
        if (cookieToken) {
            const user = await authenticateSessionToken(request, cookieToken);
            if (!user) {
                return reply.status(401).send({ error: 'Invalid token' });
            }
            request.user = user;
            return;
        }

        const apiKey = request.headers['x-api-key'] as string;
        if (apiKey) {
            const key = await authenticateApiKey(apiKey);

            if (!key || key.revokedAt) {
                return reply.status(401).send({ error: 'Invalid or revoked API key' });
            }

            // Inject user info into request
            request.user = {
                id: key.user.id,
                username: key.user.username,
                role: key.user.role as Role,
                isApiKey: true,
            };
            return;
        }

        return reply.status(401).send({ error: 'Authentication required' });
    } catch (err) {
        return reply.status(401).send({ error: 'Invalid token' });
    }
}

async function authenticateSessionToken(
    request: FastifyRequest,
    token: string
): Promise<JwtPayload | null> {
    const decoded = await request.server.jwt.verify<JwtPayload>(token);
    if (!decoded?.id) {
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
            id: true,
            username: true,
            role: true,
            sessionVersion: true,
        },
    });

    if (!user) {
        return null;
    }

    const tokenSessionVersion = decoded.sessionVersion ?? 0;
    if (tokenSessionVersion !== user.sessionVersion) {
        return null;
    }

    return {
        id: user.id,
        username: user.username,
        role: user.role as Role,
        sessionVersion: user.sessionVersion,
    };
}

export async function authenticateSseJWT(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    return authenticateJWT(request, reply);
}

// Require specific role
export function requireRole(...roles: Role[]) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const user = request.user;
        if (!user) {
            return reply.status(401).send({ error: 'Authentication required' });
        }

        if (!roles.includes(user.role)) {
            return reply.status(403).send({ error: 'Insufficient permissions' });
        }
    };
}

// Require admin role
export async function requireAdmin(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const user = request.user;
    if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
    }

    if (user.role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Admin access required' });
    }
}

// Block write operations for API keys (read-only)
export async function blockApiKeyWrites(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const user = request.user;
    if (user?.isApiKey) {
        return reply.status(403).send({ error: 'API keys are read-only' });
    }
}
