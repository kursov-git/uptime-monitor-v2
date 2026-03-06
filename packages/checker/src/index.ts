import axios from 'axios';
import axiosRetry from 'axios-retry';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

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
    url: string;
    method: string;
    timeoutSeconds: number;
    expectedStatus: number;
    expectedBody: string | null;
    headers: string | null;
    authMethod: string;
    authUrl: string | null;
    authPayload: string | null;
    authTokenRegex: string | null;
}

export interface PerformCheckResult {
    isUp: boolean;
    responseTimeMs: number;
    statusCode: number | null;
    error: string | null;
}

export async function performCheck(input: PerformCheckInput): Promise<PerformCheckResult> {
    const startTime = Date.now();
    let isUp = false;
    let statusCode: number | null = null;
    let error: string | null = null;

    try {
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

        const response = await client({
            method: input.method as any,
            url: input.url,
            headers,
            timeout: input.timeoutSeconds * 1000,
            validateStatus: () => true,
        });

        statusCode = response.status;

        if (response.status !== input.expectedStatus) {
            error = `Expected status ${input.expectedStatus}, got ${response.status}`;
            isUp = false;
        } else {
            isUp = true;
        }

        if (isUp && input.expectedBody) {
            const bodyStr = typeof response.data === 'string'
                ? response.data
                : JSON.stringify(response.data);

            try {
                const regex = new RegExp(input.expectedBody);
                if (!regex.test(bodyStr)) {
                    isUp = false;
                    error = `Body does not match pattern: ${input.expectedBody}`;
                }
            } catch {
                if (!bodyStr.includes(input.expectedBody)) {
                    isUp = false;
                    error = `Body does not contain: ${input.expectedBody}`;
                }
            }
        }
    } catch (err: any) {
        isUp = false;
        error = err.message || 'Unknown error';
    }

    return {
        isUp,
        responseTimeMs: Date.now() - startTime,
        statusCode,
        error,
    };
}
