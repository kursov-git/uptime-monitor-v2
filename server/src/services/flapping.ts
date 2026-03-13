import { PrismaClient, Monitor } from '@prisma/client';
import { TelegramNotifier, TelegramConfig } from './telegram';
import { ZulipNotifier, ZulipConfig } from './zulip';
import { decrypt } from '../lib/crypto';
import {
    buildMonitorDownMessage,
    buildMonitorRecoveryMessage,
    buildMonitorSslExpiringMessage,
    buildMonitorSslRecoveryMessage,
    htmlToNotifierText,
} from './notificationMessages';

interface MonitorState {
    consecutiveFailures: number;
    firstFailureTime: number | null;
    notified: boolean;
    lastNotifiedAt: number | null;
    lastError: string | null;
    sslWarningActive: boolean;
    sslLastNotifiedAt: number | null;
}

interface CachedSettings {
    data: Awaited<ReturnType<FlappingService['fetchSettings']>>;
    cachedAt: number;
}

const SETTINGS_CACHE_TTL_MS = 60_000; // 1 minute
const SSL_RENOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
                sslWarningActive: false,
                sslLastNotifiedAt: null,
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
            ssl?: {
                expiresAt: string | null;
                daysRemaining: number | null;
                issuer: string | null;
                subject: string | null;
            } | null;
        } = {}
    ): Promise<void> {
        const state = this.getState(monitor.id);

        if (isUp) {
            await this.handleSslState(monitor, state, context.ssl);
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

    private async handleSslState(
        monitor: Monitor,
        state: MonitorState,
        ssl: {
            expiresAt: string | null;
            daysRemaining: number | null;
            issuer: string | null;
            subject: string | null;
        } | null | undefined
    ): Promise<void> {
        if (!monitor.sslExpiryEnabled) {
            state.sslWarningActive = false;
            state.sslLastNotifiedAt = null;
            return;
        }

        if (!ssl || ssl.daysRemaining === null || ssl.daysRemaining === undefined) {
            return;
        }

        const warningActive = ssl.daysRemaining <= monitor.sslExpiryThresholdDays;
        const settings = warningActive || state.sslWarningActive
            ? await this.getSettings(monitor.id)
            : null;

        if (warningActive) {
            const shouldNotify = !state.sslWarningActive
                || !state.sslLastNotifiedAt
                || (Date.now() - state.sslLastNotifiedAt) >= SSL_RENOTIFY_INTERVAL_MS;

            state.sslWarningActive = true;
            if (shouldNotify && settings) {
                state.sslLastNotifiedAt = Date.now();
                await this.sendNotification(
                    monitor,
                    buildMonitorSslExpiringMessage(monitor, {
                        appBaseUrl: settings.appBaseUrl,
                        thresholdDays: monitor.sslExpiryThresholdDays,
                        expiresAt: ssl.expiresAt,
                        daysRemaining: ssl.daysRemaining,
                        issuer: ssl.issuer,
                        subject: ssl.subject,
                    }),
                    settings
                );
            }
            return;
        }

        if (state.sslWarningActive && settings) {
            await this.sendNotification(
                monitor,
                buildMonitorSslRecoveryMessage(monitor, {
                    appBaseUrl: settings.appBaseUrl,
                    thresholdDays: monitor.sslExpiryThresholdDays,
                    expiresAt: ssl.expiresAt,
                    daysRemaining: ssl.daysRemaining,
                    issuer: ssl.issuer,
                    subject: ssl.subject,
                }),
                settings
            );
        }

        state.sslWarningActive = false;
        state.sslLastNotifiedAt = null;
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
