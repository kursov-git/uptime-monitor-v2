import prisma from '../lib/prisma';
import { logAction } from './auditService';

const DEFAULT_INTERVAL_MS = 10_000;

export class AgentOfflineMonitorService {
    private timer: NodeJS.Timeout | null = null;

    start(intervalMs = DEFAULT_INTERVAL_MS) {
        if (this.timer) return;
        this.timer = setInterval(() => {
            this.tick().catch((err) => {
                console.error('AgentOfflineMonitor tick error:', err);
            });
        }, intervalMs);
    }

    stop() {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    }

    async tick(now = new Date()): Promise<number> {
        const agents = await prisma.agent.findMany({
            where: {
                status: 'ONLINE',
                revokedAt: null,
            },
            select: {
                id: true,
                lastSeen: true,
                offlineAfterSec: true,
            },
        });

        const toOffline = agents
            .filter((agent) => now.getTime() - agent.lastSeen.getTime() > agent.offlineAfterSec * 1000)
            .map((agent) => agent.id);

        if (toOffline.length === 0) return 0;

        const res = await prisma.agent.updateMany({
            where: { id: { in: toOffline } },
            data: { status: 'OFFLINE' },
        });
        if (res.count > 0) {
            await logAction('AGENT_OFFLINE', null, { agentIds: toOffline });
        }

        return res.count;
    }
}
