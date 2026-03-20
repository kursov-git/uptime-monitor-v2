import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import axiosRetry from 'axios-retry';
import { performCheck } from '../../../packages/checker/src';

const mockLookup = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());
const mockTlsConnect = vi.hoisted(() => vi.fn());
const mockNetConnect = vi.hoisted(() => vi.fn());

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

vi.mock('node:dns/promises', () => ({
    default: {
        lookup: mockLookup,
        resolve: mockResolve,
    },
}));

vi.mock('node:net', () => ({
    default: {
        connect: mockNetConnect,
        isIP: (value: string) => {
            if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
                return 4;
            }
            if (value.includes(':')) {
                return 6;
            }
            return 0;
        },
    },
}));

vi.mock('node:tls', () => ({
    default: {
        connect: mockTlsConnect,
    },
}));

vi.mock('axios-retry', () => ({
    default: vi.fn(),
    isNetworkOrIdempotentRequestError: vi.fn(() => false),
}));

describe('checker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
        mockResolve.mockResolvedValue(['93.184.216.34']);
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

    it('extracts SSL expiry metadata for HTTPS targets when enabled', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: { ok: true },
            headers: {},
            request: {
                res: {
                    socket: {
                        getPeerCertificate: () => ({
                            valid_to: 'Jun 10 12:00:00 2026 GMT',
                            issuer: { CN: 'Let\'s Encrypt E7' },
                            subject: { CN: 'ping-agent.ru' },
                        }),
                    },
                },
            },
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
            sslExpiryEnabled: true,
            sslExpiryThresholdDays: 14,
        });

        expect(result.isUp).toBe(true);
        expect(result.ssl).toMatchObject({
            expiresAt: '2026-06-10T12:00:00.000Z',
            issuer: 'Let\'s Encrypt E7',
            subject: 'ping-agent.ru',
        });
        expect(typeof result.ssl?.daysRemaining).toBe('number');
        expect(mockTlsConnect).not.toHaveBeenCalled();
    });

    it('falls back to a dedicated TLS handshake when axios does not expose the peer certificate', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: { ok: true },
            headers: {},
            request: {},
        });

        mockTlsConnect.mockImplementation(() => {
            const socket = new EventEmitter() as EventEmitter & {
                setTimeout: ReturnType<typeof vi.fn>;
                getPeerCertificate: ReturnType<typeof vi.fn>;
                end: ReturnType<typeof vi.fn>;
                destroy: ReturnType<typeof vi.fn>;
            };
            socket.setTimeout = vi.fn();
            socket.getPeerCertificate = vi.fn(() => ({
                valid_to: 'Jun 10 12:00:00 2026 GMT',
                issuer: { CN: 'Fallback CA' },
                subject: { CN: 'example.com' },
            }));
            socket.end = vi.fn();
            socket.destroy = vi.fn();

            queueMicrotask(() => {
                socket.emit('secureConnect');
            });

            return socket;
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
            sslExpiryEnabled: true,
            sslExpiryThresholdDays: 14,
        });

        expect(result.isUp).toBe(true);
        expect(mockTlsConnect).toHaveBeenCalledTimes(1);
        expect(result.ssl).toMatchObject({
            expiresAt: '2026-06-10T12:00:00.000Z',
            issuer: 'Fallback CA',
            subject: 'example.com',
        });
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

    it('sends raw request body for methods that support a payload', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: { ok: true },
            headers: {},
        });

        await performCheck({
            url: 'https://example.com/api/send',
            method: 'POST',
            timeoutSeconds: 5,
            expectedStatus: 200,
            expectedBody: null,
            requestBody: '{"beep":"boop"}',
            headers: '{"Content-Type":"application/json"}',
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
        });

        const lastCall = mockAxiosInstance.mock.calls[mockAxiosInstance.mock.calls.length - 1][0];
        expect(lastCall.method).toBe('POST');
        expect(lastCall.data).toBe('{"beep":"boop"}');
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

    it('blocks direct loopback targets before issuing a request', async () => {
        const result = await performCheck({
            url: 'http://127.0.0.1/internal',
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
        expect(result.statusCode).toBeNull();
        expect(result.error).toBe('primary target is not allowed: loopback');
        expect(mockAxiosInstance).not.toHaveBeenCalled();
    });

    it('blocks hostname targets that resolve to private addresses', async () => {
        mockLookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);

        const result = await performCheck({
            url: 'https://private.example.com/health',
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
        expect(result.statusCode).toBeNull();
        expect(result.error).toContain('primary target resolves to a disallowed address: 10.0.0.5');
        expect(mockAxiosInstance).not.toHaveBeenCalled();
    });

    it('supports explicit contains assertions', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: 'service is healthy',
            headers: {},
        });

        const result = await performCheck({
            url: 'https://example.com/body',
            method: 'GET',
            timeoutSeconds: 5,
            expectedStatus: 200,
            expectedBody: 'healthy',
            bodyAssertionType: 'CONTAINS',
            bodyAssertionPath: null,
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
        });

        expect(result.isUp).toBe(true);
        expect(result.error).toBeNull();
    });

    it('supports JSON path equals assertions', async () => {
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: {
                data: {
                    status: 'ok',
                },
            },
            headers: {},
        });

        const result = await performCheck({
            url: 'https://example.com/json',
            method: 'GET',
            timeoutSeconds: 5,
            expectedStatus: 200,
            expectedBody: 'ok',
            bodyAssertionType: 'JSON_PATH_EQUALS',
            bodyAssertionPath: 'data.status',
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
        });

        expect(result.isUp).toBe(true);
        expect(result.error).toBeNull();
    });

    it('performs TCP connect checks without issuing HTTP requests', async () => {
        mockNetConnect.mockImplementation(() => {
            const socket = new EventEmitter() as EventEmitter & {
                setTimeout: ReturnType<typeof vi.fn>;
                end: ReturnType<typeof vi.fn>;
                destroy: ReturnType<typeof vi.fn>;
                once: EventEmitter['once'];
            };
            socket.setTimeout = vi.fn();
            socket.end = vi.fn();
            socket.destroy = vi.fn();

            queueMicrotask(() => {
                socket.emit('connect');
            });

            return socket as any;
        });

        const result = await performCheck({
            type: 'TCP',
            url: 'tcp://redis.example.com:6379',
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
        expect(result.statusCode).toBeNull();
        expect(mockNetConnect).toHaveBeenCalledWith({ host: 'redis.example.com', port: 6379 });
        expect(mockAxiosInstance).not.toHaveBeenCalled();
    });

    it('performs DNS checks and matches expected answers', async () => {
        mockResolve.mockResolvedValueOnce(['1.1.1.1', '1.0.0.1']);

        const result = await performCheck({
            type: 'DNS',
            url: 'dns://example.com',
            dnsRecordType: 'A',
            method: 'GET',
            timeoutSeconds: 5,
            expectedStatus: 200,
            expectedBody: '1.1.1.1',
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
        });

        expect(result.isUp).toBe(true);
        expect(result.error).toBeNull();
        expect(mockResolve).toHaveBeenCalledWith('example.com', 'A');
        expect(mockAxiosInstance).not.toHaveBeenCalled();
    });
});
