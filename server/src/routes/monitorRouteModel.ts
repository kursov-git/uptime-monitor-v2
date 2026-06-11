import { encrypt } from '../lib/crypto';

type SampleableCheckResult = {
    timestamp: Date;
    responseTimeMs: number;
    isUp: boolean;
};

export type MonitorDataInput = {
    type: string;
    url: string;
    serviceName?: string | null;
    method?: string | null;
    intervalSeconds?: number | null;
    timeoutSeconds?: number | null;
    expectedStatus?: number | null;
    expectedBody?: string | null;
    requestBody?: string | null;
    bodyAssertionType?: string | null;
    bodyAssertionPath?: string | null;
    headers?: string | null;
    authMethod?: string | null;
    authUrl?: string | null;
    authPayload?: string | null;
    authTokenRegex?: string | null;
    sslExpiryEnabled?: boolean | null;
    sslExpiryThresholdDays?: number | null;
    dnsRecordType?: string | null;
    agentId?: string | null;
    name: string;
};

function normalizeMonitorType(type: string | undefined): string {
    return String(type || 'HTTP').toUpperCase();
}

function normalizeDnsRecordType(dnsRecordType: string | undefined): string {
    return String(dnsRecordType || 'A').toUpperCase();
}

function normalizeRequestBody(method: string | undefined, requestBody: string | null | undefined): string | null {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    if (['GET', 'HEAD'].includes(normalizedMethod)) {
        return null;
    }

    return requestBody && requestBody.length > 0 ? requestBody : null;
}

export function buildMonitorData(input: MonitorDataInput) {
    const type = normalizeMonitorType(input.type);
    const intervalSeconds = input.intervalSeconds ?? 60;
    const timeoutSeconds = input.timeoutSeconds ?? 30;
    const serviceName = input.serviceName?.trim() ? input.serviceName.trim() : null;

    if (type === 'TCP') {
        return {
            name: input.name.trim(),
            serviceName,
            type,
            url: input.url.trim(),
            dnsRecordType: 'A',
            agentId: input.agentId === undefined ? null : input.agentId,
            method: 'GET',
            intervalSeconds,
            timeoutSeconds,
            expectedStatus: 200,
            expectedBody: null,
            requestBody: null,
            bodyAssertionType: 'NONE',
            bodyAssertionPath: null,
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
            sslExpiryEnabled: false,
            sslExpiryThresholdDays: 14,
        };
    }

    if (type === 'DNS') {
        return {
            name: input.name.trim(),
            serviceName,
            type,
            url: input.url.trim(),
            dnsRecordType: normalizeDnsRecordType(input.dnsRecordType ?? undefined),
            agentId: input.agentId === undefined ? null : input.agentId,
            method: 'GET',
            intervalSeconds,
            timeoutSeconds,
            expectedStatus: 200,
            expectedBody: input.expectedBody || null,
            requestBody: null,
            bodyAssertionType: 'NONE',
            bodyAssertionPath: null,
            headers: null,
            authMethod: 'NONE',
            authUrl: null,
            authPayload: null,
            authTokenRegex: null,
            sslExpiryEnabled: false,
            sslExpiryThresholdDays: 14,
        };
    }

    const normalizedMethod = String(input.method || 'GET').toUpperCase();
    return {
        name: input.name.trim(),
        serviceName,
        type,
        url: input.url.trim(),
        dnsRecordType: 'A',
        agentId: input.agentId === undefined ? null : input.agentId,
        method: normalizedMethod,
        intervalSeconds,
        timeoutSeconds,
        expectedStatus: input.expectedStatus ?? 200,
        expectedBody: input.expectedBody || null,
        requestBody: normalizeRequestBody(normalizedMethod, input.requestBody),
        bodyAssertionType: input.bodyAssertionType || (input.expectedBody ? 'AUTO' : 'NONE'),
        bodyAssertionPath: input.bodyAssertionPath || null,
        headers: input.headers || null,
        authMethod: input.authMethod || 'NONE',
        authUrl: input.authUrl || null,
        authPayload: input.authPayload ? encrypt(input.authPayload) : null,
        authTokenRegex: input.authTokenRegex || null,
        sslExpiryEnabled: input.sslExpiryEnabled || false,
        sslExpiryThresholdDays: input.sslExpiryThresholdDays || 14,
    };
}

export function downsampleHistoryResults<T extends SampleableCheckResult>(results: T[], sampleTo: number): T[] {
    if (!Number.isFinite(sampleTo) || sampleTo <= 0 || results.length <= sampleTo) {
        return results;
    }

    const ascending = [...results].reverse();
    const first = ascending[0];
    const last = ascending[ascending.length - 1];
    const middle = ascending.slice(1, -1);
    const bucketCount = Math.max(1, Math.floor((sampleTo - 2) / 2));
    const bucketSize = Math.max(1, Math.ceil(middle.length / bucketCount));
    const sampled: T[] = [first];

    for (let index = 0; index < middle.length; index += bucketSize) {
        const bucket = middle.slice(index, index + bucketSize);
        if (bucket.length === 0) continue;

        const firstFailure = bucket.find((entry) => !entry.isUp) ?? null;
        const peak = bucket.reduce((highest, entry) => (
            entry.responseTimeMs >= highest.responseTimeMs ? entry : highest
        ), bucket[0]);

        const bucketPoints = [firstFailure, peak]
            .filter((entry): entry is T => Boolean(entry))
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
            .filter((entry, entryIndex, allEntries) => entryIndex === 0 || entry !== allEntries[entryIndex - 1]);

        sampled.push(...bucketPoints);
    }

    sampled.push(last);

    return sampled
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .filter((entry, entryIndex, allEntries) => entryIndex === 0 || entry !== allEntries[entryIndex - 1])
        .reverse();
}
