import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { hashAgentToken } from '../services/agentAuth';
import { publicStatusService } from '../services/publicStatus';

export function normalizeForSnapshot<T extends Record<string, unknown>>(input: T): T {
    return JSON.parse(JSON.stringify(input, (key, value) => {
        if (key === 'version' && typeof value === 'number') {
            return '<version>';
        }
        if (typeof value === 'string') {
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
                return '<uuid>';
            }
            if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
                return '<iso-date>';
            }
            if (value.startsWith('um_')) {
                return '<api-key>';
            }
            if (value.split('.').length === 3 && value.length > 30) {
                return '<jwt>';
            }
        }
        return value;
    })) as T;
}

export async function resetContractTestState(): Promise<void> {
    publicStatusService.reset();
    await prisma.notificationHistory.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
    await prisma.notificationSettings.deleteMany();
}

export async function createAdminToken(app: FastifyInstance): Promise<string> {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.create({
        data: { username: 'contract_admin', passwordHash, role: 'ADMIN' },
    });
    return app.jwt.sign({
        id: admin.id,
        username: admin.username,
        role: admin.role,
        sessionVersion: admin.sessionVersion,
    });
}

export async function createAgentToken(name: string, heartbeatIntervalSec = 20) {
    const token = `${name}-token-${crypto.randomUUID()}`;
    const agent = await prisma.agent.create({
        data: {
            name,
            tokenHash: hashAgentToken(token),
            heartbeatIntervalSec,
        },
    });

    return { agent, token };
}
