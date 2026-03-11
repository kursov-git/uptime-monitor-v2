import axios from 'axios';
import { sleep } from '../lib/utils';
import { logger } from '../lib/logger';

const zulipLogger = logger.child({ component: 'zulip-notifier' });

export interface ZulipConfig {
    botEmail: string;
    apiKey: string;
    serverUrl: string;
    stream: string;
    topic: string;
}

export class ZulipNotifier {
    async send(config: ZulipConfig, message: string, retries = 3): Promise<{ success: boolean; error?: string }> {
        let lastError = 'Unknown error';
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const url = `${config.serverUrl.replace(/\/$/, '')}/api/v1/messages`;

                const response = await axios.post(
                    url,
                    new URLSearchParams({
                        type: 'stream',
                        to: config.stream,
                        topic: config.topic,
                        content: message,
                    }).toString(),
                    {
                        auth: {
                            username: config.botEmail,
                            password: config.apiKey,
                        },
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        timeout: 10000,
                    }
                );

                if (response.data?.result === 'success') {
                    return { success: true };
                }
            } catch (err: any) {
                lastError = err.message || 'Unknown Zulip API error';
                if (attempt < retries - 1) {
                    const delay = 1000 * Math.pow(2, attempt);
                    zulipLogger.warn({ attempt: attempt + 1, retries, delay, error: lastError }, 'Zulip send failed, retrying');
                    await sleep(delay);
                } else {
                    zulipLogger.error({ retries, error: lastError }, 'Zulip notification failed');
                    return { success: false, error: lastError };
                }
            }
        }
        return { success: false, error: lastError };
    }
}
