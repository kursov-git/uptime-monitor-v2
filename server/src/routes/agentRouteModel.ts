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
