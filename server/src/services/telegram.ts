import axios from 'axios';
import { sleep } from '../lib/utils';
import { logger } from '../lib/logger';

const telegramLogger = logger.child({ component: 'telegram-notifier' });

export interface TelegramConfig {
    botToken: string;
    chatId: string;
}

export class TelegramNotifier {
    async send(config: TelegramConfig, message: string, retries = 3): Promise<{ success: boolean; error?: string }> {
        let lastError = 'Unknown error';
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
                const response = await axios.post(url, {
                    chat_id: config.chatId,
                    text: message,
                    parse_mode: 'HTML',
                }, { timeout: 10000 });

                if (response.data?.ok === true) {
                    return { success: true };
                }
            } catch (err: any) {
                lastError = err.message || 'Unknown Telegram API error';
                if (attempt < retries - 1) {
                    const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
                    telegramLogger.warn({ attempt: attempt + 1, retries, delay, error: lastError }, 'Telegram send failed, retrying');
                    await sleep(delay);
                } else {
                    telegramLogger.error({ retries, error: lastError }, 'Telegram notification failed');
                    return { success: false, error: lastError };
                }
            }
        }
        return { success: false, error: lastError };
    }
}
