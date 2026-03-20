import axios from 'axios';
import axiosRetry from 'axios-retry';
import { wrapper } from 'axios-cookiejar-support';
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { CookieJar } from 'tough-cookie';
import { assertSafeCheckTargets } from './targetGuards';

export { assertSafeCheckTargets, getBlockedTargetReasonFromUrl } from './targetGuards';

const RETRY_CONFIG = {
    retries: 3,
    retryDelay: (retryCount: number) => retryCount * 1000,
    retryCondition: (error: any) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            error.code === 'EAI_AGAIN' ||
            (error.message && error.message.includes('EAI_AGAIN')) ||
            error.code === 'ECONNRESET';
    }
};

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

export interface SslCheckSnapshot {
    expiresAt: string | null;
    daysRemaining: number | null;
    issuer: string | null;
    subject: string | null;
}

export interface PerformCheckResult {
    isUp: boolean;
    responseTimeMs: number;
    statusCode: number | null;
    error: string | null;
    ssl: SslCheckSnapshot | null;
}

type PeerCertificateLike = {
    valid_to?: string;
    issuer?: Record<string, string>;
    subject?: Record<string, string>;
};

function formatCertificateParty(input: Record<string, string> | undefined): string | null {
    if (!input) {
        return null;
    }

    if (input.CN) {
        return input.CN;
    }

    const pairs = Object.entries(input).filter(([, value]) => Boolean(value));
    if (pairs.length === 0) {
        return null;
    }

    return pairs.map(([key, value]) => `${key}=${value}`).join(', ');
}

function extractPeerCertificate(response: any): PeerCertificateLike | null {
    const socket = response?.request?.res?.socket
        || response?.request?.socket
        || response?.socket;
    const getPeerCertificate = socket?.getPeerCertificate;

    if (typeof getPeerCertificate !== 'function') {
        return null;
    }

    const certificate = getPeerCertificate.call(socket);
    if (!certificate || Object.keys(certificate).length === 0) {
        return null;
    }

    return certificate as PeerCertificateLike;
}

function extractSslSnapshot(response: any): SslCheckSnapshot | null {
    const certificate = extractPeerCertificate(response);
    if (!certificate) {
        return null;
    }

    return buildSslSnapshot(certificate);
}

function buildSslSnapshot(certificate: PeerCertificateLike): SslCheckSnapshot {
    const validTo = certificate?.valid_to ? new Date(certificate.valid_to) : null;
    const expiresAt = validTo && !Number.isNaN(validTo.getTime()) ? validTo : null;

    return {
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        daysRemaining: expiresAt
            ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000)
            : null,
        issuer: formatCertificateParty(certificate?.issuer),
        subject: formatCertificateParty(certificate?.subject),
    };
}

async function fetchSslSnapshotFromTls(targetUrl: string, timeoutMs: number): Promise<SslCheckSnapshot | null> {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') {
        return null;
    }

    const hostname = parsed.hostname;
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443;

    return await new Promise<SslCheckSnapshot | null>((resolve, reject) => {
        let settled = false;
        const finalize = (fn: () => void) => {
            if (settled) {
                return;
            }
            settled = true;
            fn();
        };

        const socket = tls.connect({
            host: hostname,
            port,
            servername: hostname,
            rejectUnauthorized: false,
        });

        socket.setTimeout(timeoutMs);

        socket.once('secureConnect', () => {
            finalize(() => {
                try {
                    const certificate = socket.getPeerCertificate();
                    socket.end();

                    if (!certificate || Object.keys(certificate).length === 0) {
                        resolve(null);
                        return;
                    }

                    resolve(buildSslSnapshot(certificate as PeerCertificateLike));
                } catch (err) {
                    reject(err);
                }
            });
        });

        socket.once('timeout', () => {
            finalize(() => {
                socket.destroy();
                reject(new Error(`TLS handshake timed out after ${timeoutMs}ms`));
            });
        });

        socket.once('error', (err) => {
            finalize(() => {
                socket.destroy();
                reject(err);
            });
        });
    });
}

async function resolveSslSnapshot(input: PerformCheckInput, response: any): Promise<SslCheckSnapshot | null> {
    if (!input.sslExpiryEnabled) {
        return null;
    }

    const targetUrl = typeof response?.request?.res?.responseUrl === 'string'
        ? response.request.res.responseUrl
        : input.url;
    const protocol = new URL(targetUrl).protocol;

    if (protocol !== 'https:') {
        return null;
    }

    return extractSslSnapshot(response) || await fetchSslSnapshotFromTls(targetUrl, input.timeoutSeconds * 1000);
}

function getJsonPathValue(input: unknown, path: string): unknown {
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.').map((part) => part.trim()).filter(Boolean);

    let current: any = input;
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }

        current = current[part];
    }

    return current;
}

function evaluateBodyAssertion(
    body: unknown,
    expectedBody: string | null,
    bodyAssertionType: string | null | undefined,
    bodyAssertionPath: string | null | undefined
): string | null {
    const assertionType = bodyAssertionType || (expectedBody ? 'AUTO' : 'NONE');
    if (assertionType === 'NONE' || !expectedBody) {
        return null;
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    if (assertionType === 'CONTAINS') {
        return bodyStr.includes(expectedBody) ? null : `Body does not contain: ${expectedBody}`;
    }

    if (assertionType === 'REGEX') {
        try {
            const regex = new RegExp(expectedBody);
            return regex.test(bodyStr) ? null : `Body does not match regex: ${expectedBody}`;
        } catch {
            return `Invalid regex: ${expectedBody}`;
        }
    }

    if (assertionType === 'JSON_PATH_EQUALS' || assertionType === 'JSON_PATH_CONTAINS') {
        const path = bodyAssertionPath?.trim();
        if (!path) {
            return 'JSON path assertion requires a path';
        }

        if (typeof body !== 'object' || body === null) {
            return 'Response body is not valid JSON for JSON path assertion';
        }

        const value = getJsonPathValue(body, path);
        if (value === undefined) {
            return `JSON path not found: ${path}`;
        }

        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        if (assertionType === 'JSON_PATH_EQUALS') {
            return valueStr === expectedBody ? null : `JSON path ${path} expected ${expectedBody}, got ${valueStr}`;
        }

        return valueStr.includes(expectedBody) ? null : `JSON path ${path} does not contain: ${expectedBody}`;
    }

    try {
        const regex = new RegExp(expectedBody);
        return regex.test(bodyStr) ? null : `Body does not match pattern: ${expectedBody}`;
    } catch {
        return bodyStr.includes(expectedBody) ? null : `Body does not contain: ${expectedBody}`;
    }
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

function normalizeDnsAnswer(recordType: string, answer: unknown): string[] {
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
    const recordType = String(input.dnsRecordType || 'A').toUpperCase() as 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS';
    const answers = normalizeDnsAnswer(recordType, await dns.resolve(hostname, recordType as any));

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
        let parsedPayload: any = input.authPayload;
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

    const method = String(input.method || 'GET').toUpperCase();
    const canHaveBody = !['GET', 'HEAD'].includes(method);

    const response = await client({
        method: method as any,
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
    } catch (err: any) {
        return {
            isUp: false,
            responseTimeMs: Date.now() - startTime,
            statusCode: null,
            error: err.message || 'Unknown error',
            ssl: null,
        };
    }
}
