import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '../lib/prisma';
import { AgentOfflineMonitorService } from '../services/agentOfflineMonitor';

describe('AgentOfflineMonitorService', () => {
    beforeEach(async () => {
        await prisma.checkResult.deleteMany();
        await prisma.monitor.deleteMany();
        await prisma.agent.deleteMany();
    });

    it('moves stale ONLINE agents to OFFLINE based on offlineAfterSec', async () => {
        const now = new Date('2026-03-06T10:15:00.000Z');

        const stale = await prisma.agent.create({
            data: {
                name: 'stale',
                tokenHash: 'stale-token-hash',
                status: 'ONLINE',
                offlineAfterSec: 90,
                lastSeen: new Date('2026-03-06T10:10:00.000Z'),
            },
        });

        const fresh = await prisma.agent.create({
            data: {
                name: 'fresh',
                tokenHash: 'fresh-token-hash',
                status: 'ONLINE',
                offlineAfterSec: 360,
                lastSeen: new Date('2026-03-06T10:14:30.000Z'),
            },
        });

        const service = new AgentOfflineMonitorService();
        const changed = await service.tick(now);
        expect(changed).toBe(1);

        const staleNow = await prisma.agent.findUniqueOrThrow({ where: { id: stale.id } });
        const freshNow = await prisma.agent.findUniqueOrThrow({ where: { id: fresh.id } });

        expect(staleNow.status).toBe('OFFLINE');
        expect(freshNow.status).toBe('ONLINE');

        const audit = await prisma.auditLog.findMany();
        expect(audit.some((a) => a.action === 'AGENT_OFFLINE')).toBe(true);
    });
});
