import type { AgentResultFailure, AgentResultInput } from '../services/agentResults';

export type AgentJobsResponseAgent = {
    heartbeatIntervalSec: number;
    keyVersion: number;
};

export type AgentJobMonitorInput = {
    id: string;
    type: string;
    url: string;
    dnsRecordType: string;
    method: string;
    intervalSeconds: number;
    timeoutSeconds: number;
    expectedStatus: number;
    expectedBody: string | null;
    requestBody: string | null;
    bodyAssertionType: string | null;
    bodyAssertionPath: string | null;
    headers: string | null;
    authMethod: string;
    authUrl: string | null;
    authPayload: string | null;
    authTokenRegex: string | null;
    sslExpiryEnabled: boolean;
    sslExpiryThresholdDays: number;
    updatedAt: Date;
};

export type AgentJobPayload = {
    monitorId: string;
    type: string;
    url: string;
    dnsRecordType: string;
    method: string;
    intervalSeconds: number;
    timeoutMs: number;
    expectedStatus: number;
    expectedBody: string | null;
    requestBody: string | null;
    bodyAssertionType: string | null;
    bodyAssertionPath: string | null;
    headers: string | null;
    authMethod: string;
    authUrl: string | null;
    authPayloadEncrypted: string | null;
    authTokenRegex: string | null;
    sslExpiryEnabled: boolean;
    sslExpiryThresholdDays: number;
    authPayloadIv: null;
    authPayloadTag: null;
    keyVersion: number;
    version: number;
};

export type AgentJobsResponse = {
    serverTime: string;
    heartbeatIntervalSec: number;
    jobs: AgentJobPayload[];
};

export type AgentResultPayload = {
    idempotencyKey: string;
    monitorId: string;
    checkedAt?: string;
    isUp: boolean;
    responseTimeMs: number;
    statusCode?: number | null;
    error?: string | null;
    meta?: {
        ssl?: {
            expiresAt?: string | null;
            daysRemaining?: number | null;
            issuer?: string | null;
            subject?: string | null;
        };
    };
};

export type AcceptedAgentResults = {
    acceptedResults: AgentResultInput[];
    failed: AgentResultFailure[];
};

export type FlappingCheckContext = {
    executorLabel: string;
    statusCode: number | null;
    responseTimeMs: number;
    ssl: {
        expiresAt: string | null;
        daysRemaining: number | null;
        issuer: string | null;
        subject: string | null;
    } | null;
};

export function buildAgentJobPayload(
    job: AgentJobMonitorInput,
    keyVersion: number,
): AgentJobPayload {
    return {
        monitorId: job.id,
        type: job.type,
        url: job.url,
        dnsRecordType: job.dnsRecordType,
        method: job.method,
        intervalSeconds: job.intervalSeconds,
        timeoutMs: job.timeoutSeconds * 1000,
        expectedStatus: job.expectedStatus,
        expectedBody: job.expectedBody,
        requestBody: job.requestBody,
        bodyAssertionType: job.bodyAssertionType,
        bodyAssertionPath: job.bodyAssertionPath,
        headers: job.headers,
        authMethod: job.authMethod,
        authUrl: job.authUrl,
        authPayloadEncrypted: job.authPayload,
        authTokenRegex: job.authTokenRegex,
        sslExpiryEnabled: job.sslExpiryEnabled,
        sslExpiryThresholdDays: job.sslExpiryThresholdDays,
        authPayloadIv: null,
        authPayloadTag: null,
        keyVersion,
        version: job.updatedAt.getTime(),
    };
}

export function buildAgentJobsResponse(
    agent: AgentJobsResponseAgent,
    jobs: AgentJobMonitorInput[],
    serverTime = new Date().toISOString(),
): AgentJobsResponse {
    return {
        serverTime,
        heartbeatIntervalSec: agent.heartbeatIntervalSec,
        jobs: jobs.map((job) => buildAgentJobPayload(job, agent.keyVersion)),
    };
}

export function buildAgentResultInput(
    item: AgentResultPayload,
    fallbackTimestamp = new Date(),
): AgentResultInput {
    return {
        idempotencyKey: item.idempotencyKey,
        monitorId: item.monitorId,
        timestamp: item.checkedAt ? new Date(item.checkedAt) : fallbackTimestamp,
        isUp: item.isUp,
        responseTimeMs: item.responseTimeMs,
        statusCode: item.statusCode ?? null,
        error: item.error ?? null,
        sslExpiresAt: item.meta?.ssl?.expiresAt ? new Date(item.meta.ssl.expiresAt) : null,
        sslDaysRemaining: item.meta?.ssl?.daysRemaining ?? null,
        sslIssuer: item.meta?.ssl?.issuer ?? null,
        sslSubject: item.meta?.ssl?.subject ?? null,
    };
}

export function buildAcceptedAgentResults(
    results: AgentResultPayload[],
    allowedMonitorIds: Set<string>,
): AcceptedAgentResults {
    const failed: AgentResultFailure[] = [];
    const acceptedResults = results
        .filter((item) => {
            if (allowedMonitorIds.has(item.monitorId)) {
                return true;
            }

            failed.push({ idempotencyKey: item.idempotencyKey, reason: 'MONITOR_NOT_ASSIGNED_TO_AGENT' });
            return false;
        })
        .map((item) => buildAgentResultInput(item));

    return { acceptedResults, failed };
}

export function buildFlappingCheckContext(
    result: AgentResultInput,
    executorLabel: string,
): FlappingCheckContext {
    const hasSslMeta = result.sslDaysRemaining !== undefined
        || Boolean(result.sslExpiresAt)
        || Boolean(result.sslIssuer)
        || Boolean(result.sslSubject);

    return {
        executorLabel,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        ssl: hasSslMeta
            ? {
                expiresAt: result.sslExpiresAt ? result.sslExpiresAt.toISOString() : null,
                daysRemaining: result.sslDaysRemaining ?? null,
                issuer: result.sslIssuer ?? null,
                subject: result.sslSubject ?? null,
            }
            : null,
    };
}
