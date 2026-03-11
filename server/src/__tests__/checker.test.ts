import { describe, it, expect, beforeEach, vi } from 'vitest';
import axiosRetry from 'axios-retry';
import { performCheck } from '../../../packages/checker/src';

const mockAxiosInstance = vi.hoisted(() => {
    const fn = vi.fn();
    (fn as any).interceptors = { request: { use: vi.fn() }, response: { use: vi.fn() } };
    return fn;
});

vi.mock('axios', () => {
    return {
        default: {
            create: vi.fn(() => mockAxiosInstance)
        }
    };
});

vi.mock('axios-cookiejar-support', () => ({
    wrapper: (instance: unknown) => instance,
}));

vi.mock('axios-retry', () => ({
    default: vi.fn(),
    isNetworkOrIdempotentRequestError: vi.fn(() => false),
}));

describe('checker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns success for expected status', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: { ok: true },
            headers: {},
        });

        const result = await performCheck({
            url: 'https://example.com/api',
            method: 'GET',
            timeoutSeconds: 5,
            expectedStatus: 200,
            expectedBody: null,
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
        });

        expect(result.isUp).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.error).toBeNull();
    });

    it('records status mismatch as failure', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 500,
            data: {},
            headers: {},
        });

        const result = await performCheck({
            url: 'https://example.com/api',
            method: 'GET',
            timeoutSeconds: 5,
            expectedStatus: 200,
            expectedBody: null,
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
        });

        expect(result.isUp).toBe(false);
        expect(result.statusCode).toBe(500);
        expect(result.error).toBe('Expected status 200, got 500');
    });

    it('configures axios-retry for each check', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: {},
            headers: {},
        });

        await performCheck({
            url: 'https://example.com/retry',
            method: 'GET',
            timeoutSeconds: 5,
            expectedStatus: 200,
            expectedBody: null,
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
        });

        expect(axiosRetry).toHaveBeenCalledTimes(1);
        const [, retryConfig] = vi.mocked(axiosRetry).mock.calls[0];
        expect(retryConfig?.retries).toBe(3);
        expect(typeof retryConfig?.retryDelay).toBe('function');
        expect(typeof retryConfig?.retryCondition).toBe('function');
    });

    it('builds BASIC auth header from JSON payload', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: {},
            headers: {},
        });

        await performCheck({
            url: 'https://example.com/protected',
            method: 'GET',
            timeoutSeconds: 5,
            expectedStatus: 200,
            expectedBody: null,
            headers: null,
            authMethod: 'BASIC',
            authUrl: null,
            authPayload: JSON.stringify({
                username: 'worker_user',
                password: 'worker_pass',
            }),
            authTokenRegex: null,
        });

        const lastCall = mockAxiosInstance.mock.calls[mockAxiosInstance.mock.calls.length - 1][0];
        const expectedBasic = Buffer.from('worker_user:worker_pass').toString('base64');
        expect(lastCall.headers.Authorization).toBe(`Basic ${expectedBasic}`);
    });

    it('executes CSRF form login flow before main request', async () => {
        mockAxiosInstance
            .mockResolvedValueOnce({
                status: 200,
                data: '<html><input name="csrfmiddlewaretoken" value="csrf123"></html>',
                headers: {},
            })
            .mockResolvedValueOnce({
                status: 302,
                data: '{"token":"bearer-xyz"}',
                headers: {},
            })
            .mockResolvedValueOnce({
                status: 200,
                data: 'ok',
                headers: {},
            });

        await performCheck({
            url: 'https://service.example.com/endpoint',
            method: 'GET',
            timeoutSeconds: 10,
            expectedStatus: 200,
            expectedBody: null,
            headers: null,
            authMethod: 'CSRF_FORM_LOGIN',
            authUrl: 'https://service.example.com/login',
            authPayload: JSON.stringify({ username: 'alice', password: 'secret' }),
            authTokenRegex: '"token":"([^"]+)"',
        });

        expect(mockAxiosInstance).toHaveBeenCalledTimes(3);

        const preAuthCall = mockAxiosInstance.mock.calls[0][0];
        const authCall = mockAxiosInstance.mock.calls[1][0];
        const mainCall = mockAxiosInstance.mock.calls[2][0];

        expect(preAuthCall.method).toBe('GET');
        expect(preAuthCall.url).toBe('https://service.example.com/login');

        expect(authCall.method).toBe('POST');
        expect(authCall.url).toBe('https://service.example.com/login');
        expect(authCall.data).toContain('csrfmiddlewaretoken=csrf123');
        expect(authCall.data).toContain('username=alice');
        expect(authCall.data).toContain('password=secret');

        expect(mainCall.method).toBe('GET');
        expect(mainCall.url).toBe('https://service.example.com/endpoint');
        expect(mainCall.headers.Authorization).toBe('Bearer bearer-xyz');
    });
});
