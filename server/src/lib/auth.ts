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

        // Try JWT token from query string (used for SSE /stream endpoint)
        const queryToken = (request.query as any)?.token;
        if (queryToken && typeof queryToken === 'string') {
            // fastify-jwt doesn't automatically look at query strings, so we manually verify
            try {
                const decoded = await request.server.jwt.verify(queryToken);
                request.user = decoded as JwtPayload;
                return;
            } catch (err) {
                return reply.status(401).send({ error: 'Invalid query token' });
            }
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
