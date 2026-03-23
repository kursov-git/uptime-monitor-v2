import prisma from '../lib/prisma';
import { logAction } from './auditService';
import { logger } from '../lib/logger';
import { TelegramNotifier } from './telegram';
import { ZulipNotifier } from './zulip';
import { decrypt } from '../lib/crypto';
import { buildAgentOfflineMessage, htmlToNotifierText } from './notificationMessages';

const DEFAULT_INTERVAL_MS = 10_000;
const offlineMonitorLogger = logger.child({ component: 'agent-offline-monitor' });

export class AgentOfflineMonitorService {
    private timer: NodeJS.Timeout | null = null;
    private telegramNotifier = new TelegramNotifier();
    private zulipNotifier = new ZulipNotifier();
    private lastRunAt: string | null = null;
    private lastDurationMs: number | null = null;
    private lastMarkedOfflineCount = 0;
    private lastError: string | null = null;

    start(intervalMs = DEFAULT_INTERVAL_MS) {
        if (this.timer) return;
        this.timer = setInterval(() => {
            this.tick().catch((err) => {
                offlineMonitorLogger.error({ err }, 'AgentOfflineMonitor tick error');
            });
        }, intervalMs);
    }

    stop() {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    }

    getStatus() {
        return {
            running: this.timer !== null,
            lastRunAt: this.lastRunAt,
            lastDurationMs: this.lastDurationMs,
            lastMarkedOfflineCount: this.lastMarkedOfflineCount,
            lastError: this.lastError,
        };
    }

    async tick(now = new Date()): Promise<number> {
        const startedAt = Date.now();
        try {
            const agents = await prisma.agent.findMany({
                where: {
                    status: 'ONLINE',
                    revokedAt: null,
                },
                select: {
                    id: true,
                    name: true,
                    lastSeen: true,
                    offlineAfterSec: true,
                    _count: {
                        select: {
                            monitors: true,
                        },
                    },
                },
            });

            const toOffline = agents.filter(
                (agent) => now.getTime() - agent.lastSeen.getTime() > agent.offlineAfterSec * 1000
            );

            if (toOffline.length === 0) {
                this.lastRunAt = new Date().toISOString();
                this.lastDurationMs = Date.now() - startedAt;
                this.lastMarkedOfflineCount = 0;
                this.lastError = null;
                return 0;
            }

            const res = await prisma.agent.updateMany({
                where: { id: { in: toOffline.map((agent) => agent.id) } },
                data: { status: 'OFFLINE' },
            });
            if (res.count > 0) {
                await logAction('AGENT_OFFLINE', null, { agentIds: toOffline.map((agent) => agent.id) });
                await this.sendOfflineNotifications(toOffline);
            }

            this.lastRunAt = new Date().toISOString();
            this.lastDurationMs = Date.now() - startedAt;
            this.lastMarkedOfflineCount = res.count;
            this.lastError = null;
            return res.count;
        } catch (err) {
            this.lastRunAt = new Date().toISOString();
            this.lastDurationMs = Date.now() - startedAt;
            this.lastError = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    private async sendOfflineNotifications(
        agents: Array<{
            id: string;
            name: string;
            lastSeen: Date;
            offlineAfterSec: number;
            _count: { monitors: number };
        }>
    ): Promise<void> {
        const settings = await prisma.notificationSettings.findFirst();
        if (!settings) {
            return;
        }

        for (const agent of agents) {
            const message = buildAgentOfflineMessage(
                agent.name,
                agent.lastSeen,
                agent.offlineAfterSec,
                {
                    appBaseUrl: settings.appBaseUrl,
                    monitorsCount: agent._count.monitors,
                }
            );

            if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
                const result = await this.telegramNotifier.send({
                    botToken: decrypt(settings.telegramBotToken),
                    chatId: settings.telegramChatId,
                }, message);

                await prisma.notificationHistory.create({
                    data: {
                        monitorId: null,
                        channel: 'TELEGRAM',
                        status: result.success ? 'SUCCESS' : 'FAILED',
                        error: result.error || null,
                    },
                });
            }

            if (settings.zulipEnabled && settings.zulipBotEmail && settings.zulipApiKey && settings.zulipServerUrl) {
                const result = await this.zulipNotifier.send({
                    botEmail: settings.zulipBotEmail,
                    apiKey: decrypt(settings.zulipApiKey),
                    serverUrl: settings.zulipServerUrl,
                    stream: settings.zulipStream || 'alerts',
                    topic: settings.zulipTopic || 'uptime-monitor',
                }, htmlToNotifierText(message));

                await prisma.notificationHistory.create({
                    data: {
                        monitorId: null,
                        channel: 'ZULIP',
                        status: result.success ? 'SUCCESS' : 'FAILED',
                        error: result.error || null,
                    },
                });
            }
        }
    }
}
