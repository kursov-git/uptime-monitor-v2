import { FastifyRequest, FastifyReply } from 'fastify';
import { Role } from '@uptime-monitor/shared';
import prisma from './prisma';

// JWT payload interface
export interface JwtPayload {
    id: string;
    username: string;
    role: Role;
    isApiKey?: boolean;
}

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
        // First, try JWT token from header
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            await request.jwtVerify();
            return;
        }

        // Second, try API Key
        const apiKey = request.headers['x-api-key'] as string;
        if (apiKey) {
            const key = await prisma.apiKey.findUnique({
                where: { key: apiKey },
                include: { user: true },
            });

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

export async function authenticateSseJWT(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const queryToken = (request.query as { token?: unknown })?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
        try {
            const decoded = await request.server.jwt.verify(queryToken);
            request.user = decoded as JwtPayload;
            return;
        } catch {
            return reply.status(401).send({ error: 'Invalid query token' });
        }
    }

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
