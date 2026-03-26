import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const dnsResolve = vi.fn();
const netConnect = vi.fn();
const mockClient = vi.fn();
const axiosCreate = vi.fn(() => mockClient);
const axiosRetry = vi.fn();
const axiosRetryHelpers = {
    isNetworkOrIdempotentRequestError: vi.fn(() => false),
};
const wrapper = vi.fn((client) => client);

vi.mock('axios', () => ({
    default: {
        create: axiosCreate,
    },
}));

vi.mock('axios-retry', () => ({
    default: Object.assign(axiosRetry, axiosRetryHelpers),
}));

vi.mock('axios-cookiejar-support', () => ({
    wrapper,
}));

vi.mock('node:dns/promises', () => ({
    default: {
        resolve: dnsResolve,
    },
}));

vi.mock('node:net', () => ({
    default: {
        connect: netConnect,
        isIP: (value: string) => {
            if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return 4;
            if (value.includes(':')) return 6;
            return 0;
        },
    },
}));

const { performCheck } = await import('../src/index');

function baseInput() {
    return {
        url: 'https://example.com/health',
        method: 'GET',
        timeoutSeconds: 5,
        expectedStatus: 200,
        expectedBody: null,
        headers: null,
        authMethod: 'NONE',
        authUrl: null,
        authPayload: null,
        authTokenRegex: null,
        allowPrivateTargets: true,
    } as const;
}

describe('checker package', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('passes TCP checks when the socket connects', async () => {
        netConnect.mockImplementation(() => {
            const socket = new EventEmitter() as EventEmitter & {
                setTimeout: (ms: number) => void;
                end: () => void;
                destroy: () => void;
            };
            socket.setTimeout = () => {};
            socket.end = () => {};
            socket.destroy = () => {};
            queueMicrotask(() => socket.emit('connect'));
            return socket;
        });

        const result = await performCheck({
            ...baseInput(),
            type: 'TCP',
            url: 'tcp://example.com:443',
        });

        expect(result).toMatchObject({
            isUp: true,
            statusCode: null,
            error: null,
            ssl: null,
        });
    });

    it('fails DNS checks when expected answer is missing', async () => {
        dnsResolve.mockResolvedValue(['203.0.113.10']);

        const result = await performCheck({
            ...baseInput(),
            type: 'DNS',
            url: 'dns://example.com',
            dnsRecordType: 'A',
            expectedBody: '198.51.100.4',
        });

        expect(result.isUp).toBe(false);
        expect(result.error).toContain('DNS answer does not contain');
    });

    it('supports JSON path assertions for HTTP checks', async () => {
        mockClient.mockResolvedValue({
            status: 200,
            data: {
                ok: true,
                nested: { state: 'ready' },
            },
            request: {
                res: {
                    responseUrl: 'https://example.com/health',
                    socket: {
                        getPeerCertificate: () => ({}),
                    },
                },
            },
        });

        const result = await performCheck({
            ...baseInput(),
            type: 'HTTP',
            expectedBody: 'ready',
            bodyAssertionType: 'JSON_PATH_EQUALS',
            bodyAssertionPath: 'nested.state',
        });

        expect(result).toMatchObject({
            isUp: true,
            statusCode: 200,
            error: null,
        });
    });

    it('captures SSL expiry metadata from HTTPS responses', async () => {
        mockClient.mockResolvedValue({
            status: 200,
            data: 'ok',
            request: {
                res: {
                    responseUrl: 'https://example.com/health',
                    socket: {
                        getPeerCertificate: () => ({
                            valid_to: 'Jun 20 12:00:00 2030 GMT',
                            issuer: { CN: 'Example Issuer' },
                            subject: { CN: 'example.com' },
                        }),
                    },
                },
            },
        });

        const result = await performCheck({
            ...baseInput(),
            type: 'HTTP',
            sslExpiryEnabled: true,
            sslExpiryThresholdDays: 14,
        });

        expect(result.isUp).toBe(true);
        expect(result.ssl).toMatchObject({
            issuer: 'Example Issuer',
            subject: 'example.com',
        });
        expect(result.ssl?.expiresAt).toContain('2030-06-20');
        expect(typeof result.ssl?.daysRemaining).toBe('number');
    });
});
