import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { sleep } from '../lib/utils';
import { TelegramNotifier } from '../services/telegram';
import { ZulipNotifier } from '../services/zulip';

vi.mock('axios', () => ({
    default: {
        post: vi.fn(),
    },
}));

vi.mock('../lib/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/utils')>();
    return {
        ...actual,
        sleep: vi.fn().mockResolvedValue(undefined),
    };
});

describe('Notification Notifiers', () => {
    const mockedPost = vi.mocked(axios.post);
    const mockedSleep = vi.mocked(sleep);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('TelegramNotifier sends successfully on first attempt', async () => {
        mockedPost.mockResolvedValueOnce({ data: { ok: true } } as any);
        const notifier = new TelegramNotifier();

        const result = await notifier.send({ botToken: 'token', chatId: 'chat' }, 'hello', 1);

        expect(result).toEqual({ success: true });
        expect(mockedPost).toHaveBeenCalledTimes(1);
        expect(mockedPost.mock.calls[0][0]).toContain('/bottoken/sendMessage');
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
        mockedPost.mockResolvedValueOnce({ data: { ok: false } } as any);
        const notifier = new TelegramNotifier();

        const result = await notifier.send({ botToken: 'token', chatId: 'chat' }, 'hello', 1);

        expect(result).toEqual({ success: false, error: 'Unknown error' });
        expect(mockedPost).toHaveBeenCalledTimes(1);
    });

    it('ZulipNotifier succeeds when API returns result=success', async () => {
        mockedPost.mockResolvedValueOnce({ data: { result: 'success' } } as any);
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
            .mockResolvedValueOnce({ data: { result: 'success' } } as any);
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
        mockedPost.mockResolvedValueOnce({ data: { result: 'error' } } as any);
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
