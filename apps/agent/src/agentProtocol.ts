import crypto from 'crypto';
import type { PerformCheckInput, PerformCheckResult } from '@uptime-monitor/checker';
import { readAgentKeySource, type AgentKeySource } from './config';

export type AgentJob = {
    monitorId: string;
    type: 'HTTP' | 'TCP' | 'DNS';
    url: string;
    dnsRecordType?: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS';
    method: string;
    intervalSeconds: number;
    timeoutMs: number;
    expectedStatus: number;
    expectedBody: string | null;
    requestBody?: string | null;
    bodyAssertionType?: string | null;
    bodyAssertionPath?: string | null;
    headers?: string | null;
    authMethod?: string;
    authUrl?: string | null;
    authPayloadEncrypted?: string | null;
    authTokenRegex?: string | null;
    sslExpiryEnabled?: boolean;
    sslExpiryThresholdDays?: number;
    keyVersion?: number;
    version?: number;
};

export type BufferedSslMeta = {
    expiresAt?: string | null;
    daysRemaining?: number | null;
    issuer?: string | null;
    subject?: string | null;
};

export type BufferedResult = {
    idempotencyKey: string;
    monitorId: string;
    checkedAt: string;
    isUp: boolean;
    responseTimeMs: number;
    statusCode?: number | null;
    error?: string | null;
    meta?: {
        ssl?: BufferedSslMeta;
    };
};

export type ApiMethod = 'GET' | 'POST';
export type JsonRequestBody = Record<string, unknown>;

export type ParsedSseEvent = {
    lastEventId: number | null;
    event: string;
    payload: unknown | null;
};

const SSE_RECONNECT_BASE_DELAY_MS = 2_000;
const SSE_RECONNECT_MAX_DELAY_MS = 30_000;

export function calculateSseReconnectDelayMs(
    attempt: number,
    randomValue = Math.random(),
): number {
    const exponential = Math.min(
        SSE_RECONNECT_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
        SSE_RECONNECT_MAX_DELAY_MS,
    );
    const jitter = Math.floor(Math.max(0, Math.min(1, randomValue)) * 500);
    return Math.min(exponential + jitter, SSE_RECONNECT_MAX_DELAY_MS);
}

export function parseSseEvent(raw: string): ParsedSseEvent | null {
    if (!raw || raw.startsWith(':')) return null;

    let lastEventId: number | null = null;
    let event = 'message';
    let data = '';

    for (const line of raw.split('\n')) {
        if (line.startsWith('id:')) {
            const parsed = Number.parseInt(line.slice(3).trim(), 10);
            if (!Number.isNaN(parsed)) {
                lastEventId = parsed;
            }
        } else if (line.startsWith('event:')) {
            event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            data += line.slice(5).trim();
        }
    }

    if (!data) {
        return { lastEventId, event, payload: null };
    }

    try {
        return {
            lastEventId,
            event,
            payload: JSON.parse(data),
        };
    } catch {
        return {
            lastEventId,
            event,
            payload: null,
        };
    }
}

export function shouldResyncJobsFromSseEvent(event: string, payload: unknown): boolean {
    if (event === 'monitor.upsert' || event === 'monitor.delete') {
        return true;
    }

    return event === 'agent.command'
        && typeof payload === 'object'
        && payload !== null
        && 'command' in payload
        && payload.command === 'RESYNC_JOBS';
}

export function buildIdempotencyKey(monitorId: string): string {
    return `${monitorId}:${Date.now()}:${crypto.randomUUID()}`;
}

export function buildCheckInput(
    job: AgentJob,
    authPayload: string | null,
    allowPrivateTargets: boolean,
): PerformCheckInput {
    return {
        type: job.type,
        url: job.url,
        dnsRecordType: job.dnsRecordType || 'A',
        method: job.method,
        timeoutSeconds: Math.ceil(job.timeoutMs / 1000),
        expectedStatus: job.expectedStatus,
        expectedBody: job.expectedBody,
        requestBody: job.requestBody || null,
        bodyAssertionType: job.bodyAssertionType || 'AUTO',
        bodyAssertionPath: job.bodyAssertionPath || null,
        headers: job.headers || null,
        authMethod: job.authMethod || 'NONE',
        authUrl: job.authUrl || null,
        authPayload,
        authTokenRegex: job.authTokenRegex || null,
        sslExpiryEnabled: job.sslExpiryEnabled || false,
        sslExpiryThresholdDays: job.sslExpiryThresholdDays || 14,
        allowPrivateTargets,
    };
}

export function buildBufferedResult(
    job: AgentJob,
    result: PerformCheckResult,
    checkedAt = new Date().toISOString(),
    idempotencyKey = buildIdempotencyKey(job.monitorId),
): BufferedResult {
    return {
        idempotencyKey,
        monitorId: job.monitorId,
        checkedAt,
        isUp: result.isUp,
        responseTimeMs: result.responseTimeMs,
        statusCode: result.statusCode,
        error: result.error,
        meta: result.ssl ? {
            ssl: {
                expiresAt: result.ssl.expiresAt,
                daysRemaining: result.ssl.daysRemaining,
                issuer: result.ssl.issuer,
                subject: result.ssl.subject,
            },
        } : undefined,
    };
}

function getKeyForVersion(version: number, keySource: AgentKeySource): Buffer | null {
    const keyHex = keySource.encryptionKeysByVersion[version] || keySource.fallbackEncryptionKey;
    if (!keyHex) return null;

    return Buffer.from(keyHex, 'hex');
}

export function decryptAgentPayload(
    ciphertext: string | null,
    keyVersion: number,
    keySource: AgentKeySource = readAgentKeySource(),
): string | null {
    if (!ciphertext) return null;
    if (!ciphertext.startsWith('enc:')) return ciphertext;

    const key = getKeyForVersion(keyVersion, keySource);
    if (!key) return ciphertext;

    const parts = ciphertext.split(':');
    if (parts.length !== 4) return ciphertext;

    const [, ivHex, authTagHex, encryptedHex] = parts;
    try {
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return ciphertext;
    }
}
