import crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../lib/prisma';

export interface AgentContext {
    id: string;
    name: string;
    heartbeatIntervalSec: number;
    offlineAfterSec: number;
    keyVersion: number;
}

declare module 'fastify' {
    interface FastifyRequest {
        agent?: AgentContext;
    }
}

export function hashAgentToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export async function authenticateAgent(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Agent authentication required' });
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
        return reply.status(401).send({ error: 'Invalid agent token' });
    }

    const hashed = hashAgentToken(token);

    // Compatibility: if legacy plain token accidentally remained in DB,
    // allow it temporarily while migration/backfill is completed.
    const agent = await prisma.agent.findFirst({
        where: {
            OR: [
                { tokenHash: hashed },
                { tokenHash: token },
            ],
        },
        select: {
            id: true,
            name: true,
            heartbeatIntervalSec: true,
            offlineAfterSec: true,
            keyVersion: true,
            revokedAt: true,
        },
    });

    if (!agent) {
        return reply.status(401).send({ error: 'Invalid agent token' });
    }

    if (agent.revokedAt) {
        return reply.status(403).send({ error: 'Agent token revoked' });
    }

    request.agent = {
        id: agent.id,
        name: agent.name,
        heartbeatIntervalSec: agent.heartbeatIntervalSec,
        offlineAfterSec: agent.offlineAfterSec,
        keyVersion: agent.keyVersion,
    };
}
