import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CheckWorker } from '../worker';
import prisma from '../lib/prisma';
import axiosRetry from 'axios-retry';
import { encrypt } from '../lib/crypto';
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
    wrapper: (instance: any) => instance,
}));

vi.mock('axios-retry', () => ({
    default: vi.fn(),
    isNetworkOrIdempotentRequestError: vi.fn(() => false),
}));

describe('CheckWorker', () => {
    let worker: CheckWorker;
    const originalEncryptionKey = process.env.ENCRYPTION_KEY;

    beforeEach(async () => {
        worker = new CheckWorker(prisma);

        await prisma.checkResult.deleteMany();
        await prisma.monitor.deleteMany();
        vi.clearAllMocks();
    });

    afterEach(() => {
        worker.stop();
        if (originalEncryptionKey) {
            process.env.ENCRYPTION_KEY = originalEncryptionKey;
        } else {
            delete process.env.ENCRYPTION_KEY;
        }
        vi.restoreAllMocks();
    });

    it('should record a successful check on 200 OK', async () => {
        // Create test monitor
        const monitor = await prisma.monitor.create({
            data: {
                name: 'Worker Test',
                url: 'https://example.com/api',
                method: 'GET',
                expectedStatus: 200
            }
        });

        // Mock a Fast 200 response
        mockAxiosInstance.mockResolvedValue({
            status: 200,
            headers: {}
        });

        await (worker as any).performCheck(monitor);

        const results = await prisma.checkResult.findMany({ where: { monitorId: monitor.id } });
        expect(results.length).toBe(1);
        expect(results[0].isUp).toBe(true);
        expect(results[0].statusCode).toBe(200);
        expect(results[0].error).toBeNull();
    });

    it('should record a failure if expectedStatus does not match', async () => {
        const monitor = await prisma.monitor.create({
            data: {
                name: 'Bad Status Test',
                url: 'https://example.com/api',
                method: 'GET',
                expectedStatus: 200
            }
        });

        // Mock 500 error (workerAxios doesn't throw because of validateStatus: () => true)
        mockAxiosInstance.mockResolvedValue({
            status: 500,
            data: {}
        });

        await (worker as any).performCheck(monitor);

        const results = await prisma.checkResult.findMany({ where: { monitorId: monitor.id } });
        expect(results.length).toBe(1);
        expect(results[0].isUp).toBe(false);
        expect(results[0].statusCode).toBe(500);
        expect(results[0].error).toBe('Expected status 200, got 500');
    });

    it('should record a failure on DNS or Network error', async () => {
        const monitor = await prisma.monitor.create({
            data: {
                name: 'DNS Error',
                url: 'https://bad-dns.com',
                method: 'GET',
                expectedStatus: 200
            }
        });

        const error = new Error('EAI_AGAIN');
        (error as any).code = 'EAI_AGAIN';
        mockAxiosInstance.mockRejectedValue(error);

        await (worker as any).performCheck(monitor);

        const results = await prisma.checkResult.findMany({ where: { monitorId: monitor.id } });
        expect(results.length).toBe(1);
        expect(results[0].isUp).toBe(false);
        expect(results[0].error).toMatch(/EAI_AGAIN/);
    });

    it('should configure axios-retry for each check', async () => {
        const monitor = await prisma.monitor.create({
            data: {
                name: 'Retry Config',
                url: 'https://example.com/retry',
                method: 'GET',
                expectedStatus: 200
            }
        });

        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: {}
        });

        await (worker as any).performCheck(monitor);

        expect(axiosRetry).toHaveBeenCalledTimes(1);
        const [, retryConfig] = (axiosRetry as any).mock.calls[0];
        expect(retryConfig.retries).toBe(3);
        expect(typeof retryConfig.retryDelay).toBe('function');
        expect(typeof retryConfig.retryCondition).toBe('function');
    });

    it('should decrypt BASIC auth payload and send Authorization header', async () => {
        process.env.ENCRYPTION_KEY = 'b'.repeat(64);
        const encryptedPayload = encrypt(JSON.stringify({
            username: 'worker_user',
            password: 'worker_pass',
        }));

        const monitor = await prisma.monitor.create({
            data: {
                name: 'Encrypted Basic Auth',
                url: 'https://example.com/protected',
                method: 'GET',
                expectedStatus: 200,
                authMethod: 'BASIC',
                authPayload: encryptedPayload,
            },
        });

        mockAxiosInstance.mockResolvedValue({
            status: 200,
            data: {},
            headers: {},
        });

        await (worker as any).performCheck(monitor);

        expect(mockAxiosInstance).toHaveBeenCalled();
        const lastCall = mockAxiosInstance.mock.calls[mockAxiosInstance.mock.calls.length - 1][0];
        const expectedBasic = Buffer.from('worker_user:worker_pass').toString('base64');
        expect(lastCall.headers.Authorization).toBe(`Basic ${expectedBasic}`);
    });

    it('should execute CSRF form login flow and then perform main request', async () => {
        const monitor = await prisma.monitor.create({
            data: {
                name: 'CSRF Login Monitor',
                url: 'https://service.example.com/endpoint',
                method: 'GET',
                expectedStatus: 200,
                timeoutSeconds: 10,
                authMethod: 'CSRF_FORM_LOGIN',
                authUrl: 'https://service.example.com/login',
                authPayload: JSON.stringify({ username: 'alice', password: 'secret' }),
                authTokenRegex: '"token":"([^"]+)"',
            },
        });

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

        await (worker as any).performCheck(monitor);

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
