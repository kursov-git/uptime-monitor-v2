import axios from 'axios';
import { sleep } from '../lib/utils';
import { logger } from '../lib/logger';

const telegramLogger = logger.child({ component: 'telegram-notifier' });
const DEFAULT_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const DEFAULT_TELEGRAM_TIMEOUT_MS = 5000;

export interface TelegramConfig {
    botToken: string;
    chatId: string;
}

function normalizeTelegramBaseUrl(raw = process.env.TELEGRAM_API_BASE_URL): string {
    const trimmed = raw?.trim();
    return trimmed ? trimmed.replace(/\/+$/, '') : DEFAULT_TELEGRAM_API_BASE_URL;
}

function resolveTelegramTimeoutMs(raw = process.env.TELEGRAM_TIMEOUT_MS): number {
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_TELEGRAM_TIMEOUT_MS;
}

function classifyTelegramError(err: unknown, baseUrl: string): { message: string; retryable: boolean; code?: string; status?: number } {
    if (axios.isAxiosError(err)) {
        const code = err.code ?? undefined;
        const status = err.response?.status;
        const apiMessage = typeof err.response?.data?.description === 'string'
            ? err.response.data.description
            : undefined;

        if (typeof status === 'number') {
            return {
                message: apiMessage ? `Telegram API ${status}: ${apiMessage}` : `Telegram API ${status}`,
                retryable: status === 429 || status >= 500,
                code,
                status,
            };
        }

        if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
            return {
                message: `Telegram connect timeout via ${baseUrl}; check host egress or set TELEGRAM_API_BASE_URL`,
                retryable: false,
                code,
            };
        }

        if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
            return {
                message: `Telegram unreachable (${code}) via ${baseUrl}; check host egress, DNS, or TELEGRAM_API_BASE_URL`,
                retryable: false,
                code,
            };
        }
    }

    if (err instanceof Error) {
        return { message: err.message, retryable: true };
    }

    return { message: 'Unknown Telegram API error', retryable: true };
}

export class TelegramNotifier {
    async send(config: TelegramConfig, message: string, retries = 3): Promise<{ success: boolean; error?: string }> {
        const baseUrl = normalizeTelegramBaseUrl();
        const timeout = resolveTelegramTimeoutMs();
        let lastError = 'Unknown error';
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const url = `${baseUrl}/bot${config.botToken}/sendMessage`;
                const response = await axios.post(url, {
                    chat_id: config.chatId,
                    text: message,
                    parse_mode: 'HTML',
                }, { timeout });

                if (response.data?.ok === true) {
                    return { success: true };
                }

                lastError = typeof response.data?.description === 'string'
                    ? response.data.description
                    : 'Telegram API returned ok=false';
            } catch (err: unknown) {
                const classified = classifyTelegramError(err, baseUrl);
                lastError = classified.message;
                if (classified.retryable && attempt < retries - 1) {
                    const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
                    telegramLogger.warn(
                        { attempt: attempt + 1, retries, delay, error: lastError, code: classified.code, status: classified.status, baseUrl, timeoutMs: timeout },
                        'Telegram send failed, retrying'
                    );
                    await sleep(delay);
                } else {
                    telegramLogger.error(
                        { retries, error: lastError, code: classified.code, status: classified.status, baseUrl, timeoutMs: timeout },
                        'Telegram notification failed'
                    );
                    return { success: false, error: lastError };
                }
            }
        }
        return { success: false, error: lastError };
    }
}
