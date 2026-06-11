import axios from 'axios';
import type { AxiosError, Method } from 'axios';
import axiosRetry from 'axios-retry';
import { wrapper } from 'axios-cookiejar-support';
import dns from 'node:dns/promises';
import net from 'node:net';
import { CookieJar } from 'tough-cookie';
import { evaluateBodyAssertion } from './bodyAssertions';
import { resolveSslSnapshot, type SslCheckSnapshot } from './sslSnapshot';
import { assertSafeCheckTargets } from './targetGuards';

export type { SslCheckSnapshot } from './sslSnapshot';
export { assertSafeCheckTargets, getBlockedTargetReasonFromUrl } from './targetGuards';

const RETRY_CONFIG = {
    retries: 3,
    retryDelay: (retryCount: number) => retryCount * 1000,
    retryCondition: (error: AxiosError) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            error.code === 'EAI_AGAIN' ||
            (error.message && error.message.includes('EAI_AGAIN')) ||
            error.code === 'ECONNRESET';
    }
};

type DnsRecordType = NonNullable<PerformCheckInput['dnsRecordType']>;
type JsonObject = Record<string, unknown>;

const SUPPORTED_DNS_RECORD_TYPES: ReadonlySet<string> = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']);
const SUPPORTED_HTTP_METHODS: ReadonlySet<string> = new Set([
    'GET',
    'DELETE',
    'HEAD',
    'OPTIONS',
    'POST',
    'PUT',
    'PATCH',
    'PURGE',
    'LINK',
    'UNLINK',
]);

export interface PerformCheckInput {
    type?: 'HTTP' | 'TCP' | 'DNS';
    url: string;
    dnsRecordType?: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS';
    method: string;
    timeoutSeconds: number;
    expectedStatus: number;
    expectedBody: string | null;
    requestBody?: string | null;
    bodyAssertionType?: string | null;
    bodyAssertionPath?: string | null;
    headers: string | null;
    authMethod: string;
    authUrl: string | null;
    authPayload: string | null;
    authTokenRegex: string | null;
    sslExpiryEnabled?: boolean;
    sslExpiryThresholdDays?: number;
    allowPrivateTargets?: boolean;
}

export interface PerformCheckResult {
    isUp: boolean;
    responseTimeMs: number;
    statusCode: number | null;
    error: string | null;
    ssl: SslCheckSnapshot | null;
}

function normalizeMonitorType(type: PerformCheckInput['type']): 'HTTP' | 'TCP' | 'DNS' {
    return type || 'HTTP';
}

async function performTcpCheck(input: PerformCheckInput, startTime: number): Promise<PerformCheckResult> {
    const parsed = new URL(input.url);
    const host = parsed.hostname;
    const port = Number.parseInt(parsed.port, 10);

    if (!host || !Number.isInteger(port)) {
        throw new Error('TCP target must include a host and port');
    }

    await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host, port });
        let settled = false;
        const finalize = (handler: () => void) => {
            if (settled) {
                return;
            }
            settled = true;
            handler();
        };

        socket.setTimeout(input.timeoutSeconds * 1000);

        socket.once('connect', () => {
            finalize(() => {
                socket.end();
                resolve();
            });
        });

        socket.once('timeout', () => {
            finalize(() => {
                socket.destroy();
                reject(new Error(`TCP connect timed out after ${input.timeoutSeconds}s`));
            });
        });

        socket.once('error', (err) => {
            finalize(() => {
                socket.destroy();
                reject(err);
            });
        });
    });

    return {
        isUp: true,
        responseTimeMs: Date.now() - startTime,
        statusCode: null,
        error: null,
        ssl: null,
    };
}

function isSupportedDnsRecordType(value: string): value is DnsRecordType {
    return SUPPORTED_DNS_RECORD_TYPES.has(value);
}

function normalizeDnsRecordType(value: PerformCheckInput['dnsRecordType']): DnsRecordType {
    const normalized = String(value || 'A').toUpperCase();
    return isSupportedDnsRecordType(normalized) ? normalized : 'A';
}

function normalizeHttpMethod(value: string | null | undefined): Method {
    const normalized = String(value || 'GET').toUpperCase();
    return SUPPORTED_HTTP_METHODS.has(normalized) ? normalized as Method : 'GET';
}

function normalizeDnsAnswer(recordType: DnsRecordType, answer: unknown): string[] {
    if (recordType === 'TXT') {
        return (answer as string[][]).map((chunks) => chunks.join(''));
    }

    if (recordType === 'MX') {
        return (answer as Array<{ exchange: string; priority: number }>).map((record) => `${record.priority} ${record.exchange}`);
    }

    return (answer as string[]).map((value) => String(value));
}

async function performDnsCheck(input: PerformCheckInput, startTime: number): Promise<PerformCheckResult> {
    const parsed = new URL(input.url);
    const hostname = parsed.hostname;
    const recordType = normalizeDnsRecordType(input.dnsRecordType);
    const answers = normalizeDnsAnswer(recordType, await dns.resolve(hostname, recordType));

    if (answers.length === 0) {
        return {
            isUp: false,
            responseTimeMs: Date.now() - startTime,
            statusCode: null,
            error: `No ${recordType} records returned`,
            ssl: null,
        };
    }

    const expectedAnswer = input.expectedBody?.trim();
    const answerText = answers.join(' | ');
    const error = expectedAnswer && !answers.some((answer) => answer.includes(expectedAnswer))
        ? `DNS answer does not contain: ${expectedAnswer} (${answerText})`
        : null;

    return {
        isUp: error === null,
        responseTimeMs: Date.now() - startTime,
        statusCode: null,
        error,
        ssl: null,
    };
}

async function performHttpCheck(input: PerformCheckInput, startTime: number): Promise<PerformCheckResult> {
    let isUp = false;
    let statusCode: number | null = null;
    let error: string | null = null;
    let ssl: SslCheckSnapshot | null = null;

    const headers: Record<string, string> = {};
    if (input.headers) {
        try {
            Object.assign(headers, JSON.parse(input.headers));
        } catch {
            // Invalid JSON, ignore.
        }
    }

    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        validateStatus: () => true,
    }));

    axiosRetry(client, RETRY_CONFIG);

    if (input.authMethod === 'BASIC' && input.authPayload) {
        let basicStr = input.authPayload;
        try {
            const parsed = JSON.parse(input.authPayload);
            if (parsed.username && parsed.password) {
                basicStr = `${parsed.username}:${parsed.password}`;
            }
        } catch {
            // Keep payload as-is.
        }
        const b64 = Buffer.from(basicStr).toString('base64');
        headers.Authorization = `Basic ${b64}`;
    } else if ((input.authMethod === 'FORM_LOGIN' || input.authMethod === 'CSRF_FORM_LOGIN') && input.authUrl && input.authPayload) {
        let parsedPayload: string | JsonObject = input.authPayload;
        try { parsedPayload = JSON.parse(input.authPayload); } catch { }

        let authRes;

        if (input.authMethod === 'CSRF_FORM_LOGIN') {
            const preAuthRes = await client({
                method: 'GET',
                url: input.authUrl,
                timeout: input.timeoutSeconds * 1000,
            });

            let csrfToken = '';
            const bodyStr = typeof preAuthRes.data === 'string'
                ? preAuthRes.data
                : JSON.stringify(preAuthRes.data);

            const csrfMatch = /<input[^>]+name=["']csrfmiddlewaretoken["'][^>]+value=["']([^"']+)["']/i.exec(bodyStr);
            if (csrfMatch && csrfMatch[1]) {
                csrfToken = csrfMatch[1];
            }

            const params = new URLSearchParams();
            if (csrfToken) {
                params.append('csrfmiddlewaretoken', csrfToken);
            }
            if (typeof parsedPayload === 'object' && parsedPayload !== null) {
                for (const [key, value] of Object.entries(parsedPayload)) {
                    params.append(key, String(value));
                }
            }

            authRes = await client({
                method: 'POST',
                url: input.authUrl,
                data: params.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Referer: input.authUrl,
                },
                maxRedirects: 0,
                timeout: input.timeoutSeconds * 1000,
            });
        } else {
            const isUrlEncoded = typeof parsedPayload === 'string' && parsedPayload.includes('=');

            authRes = await client({
                method: 'POST',
                url: input.authUrl,
                data: isUrlEncoded ? parsedPayload : parsedPayload,
                headers: {
                    'Content-Type': isUrlEncoded ? 'application/x-www-form-urlencoded' : 'application/json',
                },
                timeout: input.timeoutSeconds * 1000,
                maxRedirects: 0,
            });
        }

        if (authRes.status >= 200 && authRes.status < 400) {
            if (input.authTokenRegex) {
                const bodyStr = typeof authRes.data === 'string'
                    ? authRes.data
                    : JSON.stringify(authRes.data);

                const match = new RegExp(input.authTokenRegex).exec(bodyStr);
                if (match && match[1]) {
                    headers.Authorization = `Bearer ${match[1]}`;
                }
            }
        } else {
            throw new Error(`Auth request failed with status ${authRes.status}`);
        }
    }

    const method = normalizeHttpMethod(input.method);
    const canHaveBody = !['GET', 'HEAD'].includes(method);

    const response = await client({
        method,
        url: input.url,
        headers,
        data: canHaveBody && input.requestBody ? input.requestBody : undefined,
        timeout: input.timeoutSeconds * 1000,
        validateStatus: () => true,
    });

    statusCode = response.status;
    ssl = await resolveSslSnapshot(input, response);

    if (response.status !== input.expectedStatus) {
        error = `Expected status ${input.expectedStatus}, got ${response.status}`;
        isUp = false;
    } else {
        isUp = true;
    }

    if (isUp) {
        const bodyAssertionError = evaluateBodyAssertion(
            response.data,
            input.expectedBody,
            input.bodyAssertionType,
            input.bodyAssertionPath
        );
        if (bodyAssertionError) {
            isUp = false;
            error = bodyAssertionError;
        }
    }

    return {
        isUp,
        responseTimeMs: Date.now() - startTime,
        statusCode,
        error,
        ssl,
    };
}

export async function performCheck(input: PerformCheckInput): Promise<PerformCheckResult> {
    const startTime = Date.now();
    const monitorType = normalizeMonitorType(input.type);

    try {
        await assertSafeCheckTargets([
            { label: 'primary', url: input.url },
            { label: 'auth', url: monitorType === 'HTTP' ? input.authUrl : null },
        ], {
            allowPrivateTargets: input.allowPrivateTargets,
        });

        if (monitorType === 'TCP') {
            return await performTcpCheck(input, startTime);
        }

        if (monitorType === 'DNS') {
            return await performDnsCheck(input, startTime);
        }

        return await performHttpCheck(input, startTime);
    } catch (err: unknown) {
        return {
            isUp: false,
            responseTimeMs: Date.now() - startTime,
            statusCode: null,
            error: err instanceof Error ? err.message : 'Unknown error',
            ssl: null,
        };
    }
}
