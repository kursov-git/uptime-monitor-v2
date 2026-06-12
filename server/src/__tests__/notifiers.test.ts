import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import { sleep } from '../lib/utils';
import { TelegramNotifier } from '../services/telegram';
import { ZulipNotifier } from '../services/zulip';

vi.mock('axios', async (importOriginal) => {
    const actual = await importOriginal<typeof import('axios')>();
    return {
        ...actual,
        default: {
            ...actual.default,
            post: vi.fn(),
            isAxiosError: vi.fn((value) => Boolean(value?.isAxiosError)),
        },
    };
});

vi.mock('../lib/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/utils')>();
    return {
        ...actual,
        sleep: vi.fn().mockResolvedValue(undefined),
    };
});

function mockAxiosResponse<T>(data: T): AxiosResponse<T> {
    return {
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
    };
}

describe('Notification Notifiers', () => {
    const mockedPost = vi.mocked(axios.post);
    const mockedSleep = vi.mocked(sleep);

    beforeEach(() => {
        vi.clearAllMocks();
        mockedPost.mockReset();
        mockedSleep.mockReset();
        mockedSleep.mockResolvedValue(undefined);
    });

    it('TelegramNotifier sends successfully on first attempt', async () => {
        mockedPost.mockResolvedValueOnce(mockAxiosResponse({ ok: true }));
        const notifier = new TelegramNotifier();

        const result = await notifier.send({ botToken: 'token', chatId: 'chat' }, 'hello', 1);

        expect(result).toEqual({ success: true });
        expect(mockedPost).toHaveBeenCalledTimes(1);
        expect(mockedPost.mock.calls[0][0]).toContain('/bottoken/sendMessage');
        expect(mockedPost.mock.calls[0][2]).toEqual({ timeout: 5000 });
    });

    it('TelegramNotifier retries and returns error on final failure', async () => {
        mockedPost
            .mockRejectedValueOnce(new Error('timeout-1'))
            .mockRejectedValueOnce(new Error('timeout-2'));
        const notifier = new TelegramNotifier();

        const result = await notifier.send({ botToken: 'token', chatId: 'chat' }, 'hello', 2);

        expect(result).toEqual({ success: false, error: 'timeout-2' });
        expect(mockedPost).toHaveBeenCalledTimes(2);
        expect(mockedSleep).toHaveBeenCalledTimes(1);
        expect(mockedSleep).toHaveBeenCalledWith(1000);
    });

    it('TelegramNotifier returns fallback error when API responds without ok=true', async () => {
        mockedPost.mockResolvedValueOnce(mockAxiosResponse({ ok: false }));
        const notifier = new TelegramNotifier();

        const result = await notifier.send({ botToken: 'token', chatId: 'chat' }, 'hello', 1);

        expect(result).toEqual({ success: false, error: 'Telegram API returned ok=false' });
        expect(mockedPost).toHaveBeenCalledTimes(1);
    });

    it('TelegramNotifier supports TELEGRAM_API_BASE_URL override', async () => {
        mockedPost.mockResolvedValueOnce(mockAxiosResponse({ ok: true }));
        const notifier = new TelegramNotifier({
            env: {
                TELEGRAM_API_BASE_URL: 'https://telegram-relay.internal/',
            },
        });

        const result = await notifier.send({ botToken: 'token', chatId: 'chat' }, 'hello', 1);

        expect(result).toEqual({ success: true });
        expect(mockedPost.mock.calls[0][0]).toBe('https://telegram-relay.internal/bottoken/sendMessage');
    });

    it('TelegramNotifier supports TELEGRAM_TIMEOUT_MS override', async () => {
        mockedPost.mockResolvedValueOnce(mockAxiosResponse({ ok: true }));
        const notifier = new TelegramNotifier({
            env: {
                TELEGRAM_TIMEOUT_MS: '9000',
            },
        });

        const result = await notifier.send({ botToken: 'token', chatId: 'chat' }, 'hello', 1);

        expect(result).toEqual({ success: true });
        expect(mockedPost.mock.calls[0][2]).toEqual({ timeout: 9000 });
    });

    it('TelegramNotifier does not retry on network egress timeout', async () => {
        mockedPost.mockRejectedValueOnce({
            isAxiosError: true,
            code: 'ECONNABORTED',
            message: 'timeout of 5000ms exceeded',
        });
        const notifier = new TelegramNotifier();

        const result = await notifier.send({ botToken: 'token', chatId: 'chat' }, 'hello', 3);

        expect(result).toEqual({
            success: false,
            error: 'Telegram connect timeout via https://api.telegram.org; check host egress or set TELEGRAM_API_BASE_URL',
        });
        expect(mockedPost).toHaveBeenCalledTimes(1);
        expect(mockedSleep).not.toHaveBeenCalled();
    });

    it('ZulipNotifier succeeds when API returns result=success', async () => {
        mockedPost.mockResolvedValueOnce(mockAxiosResponse({ result: 'success' }));
        const notifier = new ZulipNotifier();

        const result = await notifier.send({
            botEmail: 'bot@example.com',
            apiKey: 'api-key',
            serverUrl: 'https://zulip.example.com/',
            stream: 'alerts',
            topic: 'uptime',
        }, 'ping', 1);

        expect(result).toEqual({ success: true });
        expect(mockedPost).toHaveBeenCalledTimes(1);
        expect(mockedPost.mock.calls[0][0]).toBe('https://zulip.example.com/api/v1/messages');
    });

    it('ZulipNotifier retries once and then succeeds', async () => {
        mockedPost
            .mockRejectedValueOnce(new Error('temporary error'))
            .mockResolvedValueOnce(mockAxiosResponse({ result: 'success' }));
        const notifier = new ZulipNotifier();

        const result = await notifier.send({
            botEmail: 'bot@example.com',
            apiKey: 'api-key',
            serverUrl: 'https://zulip.example.com',
            stream: 'alerts',
            topic: 'uptime',
        }, 'ping', 2);

        expect(result).toEqual({ success: true });
        expect(mockedPost).toHaveBeenCalledTimes(2);
        expect(mockedSleep).toHaveBeenCalledWith(1000);
    });

    it('ZulipNotifier returns fallback error when API result is not success', async () => {
        mockedPost.mockResolvedValueOnce(mockAxiosResponse({ result: 'error' }));
        const notifier = new ZulipNotifier();

        const result = await notifier.send({
            botEmail: 'bot@example.com',
            apiKey: 'api-key',
            serverUrl: 'https://zulip.example.com',
            stream: 'alerts',
            topic: 'uptime',
        }, 'ping', 1);

        expect(result).toEqual({ success: false, error: 'Unknown error' });
        expect(mockedPost).toHaveBeenCalledTimes(1);
    });
});
