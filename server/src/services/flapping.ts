import { PrismaClient, Monitor } from '@prisma/client';
import { TelegramNotifier, TelegramConfig } from './telegram';
import { ZulipNotifier, ZulipConfig } from './zulip';
import { decrypt } from '../lib/crypto';
import {
    buildMonitorDownMessage,
    buildMonitorRecoveryMessage,
    htmlToNotifierText,
} from './notificationMessages';

interface MonitorState {
    consecutiveFailures: number;
    firstFailureTime: number | null;
    notified: boolean;
    lastNotifiedAt: number | null;
    lastError: string | null;
}

interface CachedSettings {
    data: Awaited<ReturnType<FlappingService['fetchSettings']>>;
    cachedAt: number;
}

const SETTINGS_CACHE_TTL_MS = 60_000; // 1 minute

export class FlappingService {
    private prisma: PrismaClient;

    private static states: Map<string, MonitorState> = new Map();
    private settingsCache: Map<string, CachedSettings> = new Map();
    private globalSettingsCache: CachedSettings | null = null;
    private telegramNotifier = new TelegramNotifier();
    private zulipNotifier = new ZulipNotifier();

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    private getState(monitorId: string): MonitorState {
        if (!FlappingService.states.has(monitorId)) {
            FlappingService.states.set(monitorId, {
                consecutiveFailures: 0,
                firstFailureTime: null,
                notified: false,
                lastNotifiedAt: null,
                lastError: null,
            });
        }
        return FlappingService.states.get(monitorId)!;
    }

    public static getDiagnosticState(monitorId: string): MonitorState | null {
        return this.states.get(monitorId) || null;
    }

    async handleCheckResult(
        monitor: Monitor,
        isUp: boolean,
        error: string | null,
        context: {
            executorLabel?: string;
            statusCode?: number | null;
            responseTimeMs?: number | null;
        } = {}
    ): Promise<void> {
        const state = this.getState(monitor.id);

        if (isUp) {
            // Recovery — send recovery notification if previously notified
            if (state.notified) {
                const recoverySettings = await this.getSettings(monitor.id);
                await this.sendNotification(
                    monitor,
                    buildMonitorRecoveryMessage(
                        monitor,
                        state.consecutiveFailures,
                        {
                            ...context,
                            appBaseUrl: recoverySettings.appBaseUrl,
                        }
                    ),
                    recoverySettings
                );
            }

            // Reset state
            state.consecutiveFailures = 0;
            state.firstFailureTime = null;
            state.notified = false;
            state.lastError = null;
            return;
        }

        // Failure
        state.lastError = error;
        state.consecutiveFailures++;
        if (state.firstFailureTime === null) {
            state.firstFailureTime = Date.now();
        }

        // Check if we should notify
        if (!state.notified) {
            const settings = await this.getSettings(monitor.id);
            const failCount = settings.flappingFailCount;
            const intervalSec = settings.flappingIntervalSec;

            const downTimeSec = (Date.now() - state.firstFailureTime) / 1000;

            if (state.consecutiveFailures >= failCount || downTimeSec >= intervalSec) {
                state.notified = true;
                state.lastNotifiedAt = Date.now();

                await this.sendNotification(
                    monitor,
                    buildMonitorDownMessage(
                        monitor,
                        error,
                        state.consecutiveFailures,
                        downTimeSec,
                        {
                            ...context,
                            appBaseUrl: settings.appBaseUrl,
                        }
                    ),
                    settings
                );
            }
        }
    }

    private async getSettings(monitorId: string) {
        // Check per-monitor cache
        const monitorCache = this.settingsCache.get(monitorId);
        if (monitorCache && (Date.now() - monitorCache.cachedAt) < SETTINGS_CACHE_TTL_MS) {
            return monitorCache.data;
        }

        const data = await this.fetchSettings(monitorId);

        this.settingsCache.set(monitorId, { data, cachedAt: Date.now() });
        return data;
    }

    private async fetchSettings(monitorId: string) {
        // Check for per-monitor override first
        const override = await this.prisma.monitorNotificationOverride.findUnique({
            where: { monitorId },
        });

        const global = await this.prisma.notificationSettings.findFirst();

        return {
            appBaseUrl: global?.appBaseUrl ?? null,
            flappingFailCount: override?.flappingFailCount ?? global?.flappingFailCount ?? 3,
            flappingIntervalSec: override?.flappingIntervalSec ?? global?.flappingIntervalSec ?? 300,
            telegramEnabled: override?.telegramEnabled ?? global?.telegramEnabled ?? false,
            telegramBotToken: global?.telegramBotToken ? decrypt(global.telegramBotToken) : '',
            telegramChatId: override?.telegramChatId ?? global?.telegramChatId ?? '',
            zulipEnabled: override?.zulipEnabled ?? global?.zulipEnabled ?? false,
            zulipBotEmail: global?.zulipBotEmail ?? '',
            zulipApiKey: global?.zulipApiKey ? decrypt(global.zulipApiKey) : '',
            zulipServerUrl: global?.zulipServerUrl ?? '',
            zulipStream: override?.zulipStream ?? global?.zulipStream ?? '',
            zulipTopic: override?.zulipTopic ?? global?.zulipTopic ?? '',
            retentionDays: global?.retentionDays ?? 30,
        };
    }

    /** Invalidate cached settings (call after settings are updated via API) */
    public invalidateCache(monitorId?: string) {
        if (monitorId) {
            this.settingsCache.delete(monitorId);
        } else {
            this.settingsCache.clear();
            this.globalSettingsCache = null;
        }
    }

    private async sendNotification(monitor: Monitor, message: string, settings: Awaited<ReturnType<typeof this.fetchSettings>>): Promise<void> {

        // Telegram
        if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
            const config: TelegramConfig = {
                botToken: settings.telegramBotToken,
                chatId: settings.telegramChatId,
            };
            const result = await this.telegramNotifier.send(config, message);
            await this.prisma.notificationHistory.create({
                data: {
                    monitorId: monitor.id,
                    channel: 'TELEGRAM',
                    status: result.success ? 'SUCCESS' : 'FAILED',
                    error: result.error || null,
                }
            });
        }

        // Zulip
        if (settings.zulipEnabled && settings.zulipBotEmail && settings.zulipApiKey && settings.zulipServerUrl) {
            const config: ZulipConfig = {
                botEmail: settings.zulipBotEmail,
                apiKey: settings.zulipApiKey,
                serverUrl: settings.zulipServerUrl,
                stream: settings.zulipStream,
                topic: settings.zulipTopic,
            };
            const plainMessage = htmlToNotifierText(message);
            const result = await this.zulipNotifier.send(config, plainMessage);
            await this.prisma.notificationHistory.create({
                data: {
                    monitorId: monitor.id,
                    channel: 'ZULIP',
                    status: result.success ? 'SUCCESS' : 'FAILED',
                    error: result.error || null,
                }
            });
        }
    }
}
