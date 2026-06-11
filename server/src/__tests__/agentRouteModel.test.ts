import { describe, expect, it } from 'vitest';
import { buildAgentJobPayload, buildAgentJobsResponse, type AgentJobMonitorInput } from '../routes/agentRouteModel';

function monitor(overrides: Partial<AgentJobMonitorInput> = {}): AgentJobMonitorInput {
    return {
        id: 'monitor-1',
        type: 'HTTP',
        url: 'https://example.test/health',
        dnsRecordType: 'A',
        method: 'POST',
        intervalSeconds: 30,
        timeoutSeconds: 8,
        expectedStatus: 204,
        expectedBody: 'ready',
        requestBody: '{"ping":true}',
        bodyAssertionType: 'JSON_PATH',
        bodyAssertionPath: 'status',
        headers: '{"X-Test":"yes"}',
        authMethod: 'POST_JSON',
        authUrl: 'https://example.test/login',
        authPayload: 'enc:iv:tag:ciphertext',
        authTokenRegex: '"token":"([^"]+)"',
        sslExpiryEnabled: true,
        sslExpiryThresholdDays: 21,
        updatedAt: new Date('2026-06-11T12:34:56.000Z'),
        ...overrides,
    };
}

describe('agentRouteModel', () => {
    it('builds the agent job payload contract from a monitor row', () => {
        expect(buildAgentJobPayload(monitor(), 3)).toEqual({
            monitorId: 'monitor-1',
            type: 'HTTP',
            url: 'https://example.test/health',
            dnsRecordType: 'A',
            method: 'POST',
            intervalSeconds: 30,
            timeoutMs: 8000,
            expectedStatus: 204,
            expectedBody: 'ready',
            requestBody: '{"ping":true}',
            bodyAssertionType: 'JSON_PATH',
            bodyAssertionPath: 'status',
            headers: '{"X-Test":"yes"}',
            authMethod: 'POST_JSON',
            authUrl: 'https://example.test/login',
            authPayloadEncrypted: 'enc:iv:tag:ciphertext',
            authTokenRegex: '"token":"([^"]+)"',
            sslExpiryEnabled: true,
            sslExpiryThresholdDays: 21,
            authPayloadIv: null,
            authPayloadTag: null,
            keyVersion: 3,
            version: new Date('2026-06-11T12:34:56.000Z').getTime(),
        });
    });

    it('builds the authenticated jobs response with stable server time injection', () => {
        expect(buildAgentJobsResponse(
            { heartbeatIntervalSec: 15, keyVersion: 2 },
            [
                monitor({ id: 'first', updatedAt: new Date('2026-06-11T01:00:00.000Z') }),
                monitor({ id: 'second', updatedAt: new Date('2026-06-11T02:00:00.000Z') }),
            ],
            '2026-06-11T03:00:00.000Z',
        )).toMatchObject({
            serverTime: '2026-06-11T03:00:00.000Z',
            heartbeatIntervalSec: 15,
            jobs: [
                {
                    monitorId: 'first',
                    keyVersion: 2,
                    timeoutMs: 8000,
                    version: new Date('2026-06-11T01:00:00.000Z').getTime(),
                },
                {
                    monitorId: 'second',
                    keyVersion: 2,
                    timeoutMs: 8000,
                    version: new Date('2026-06-11T02:00:00.000Z').getTime(),
                },
            ],
        });
    });
});
