import { describe, expect, it } from 'vitest';
import {
    buildAcceptedAgentResults,
    buildAgentJobPayload,
    buildAgentJobsResponse,
    buildAgentResultInput,
    buildFlappingCheckContext,
    type AgentJobMonitorInput,
} from '../routes/agentRouteModel';

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

    it('maps accepted result payloads and rejects unassigned monitor results', () => {
        const { acceptedResults, failed } = buildAcceptedAgentResults([
            {
                idempotencyKey: 'accepted-1',
                monitorId: 'monitor-1',
                checkedAt: '2026-06-11T12:00:00.000Z',
                isUp: true,
                responseTimeMs: 123,
                statusCode: 200,
                meta: {
                    ssl: {
                        expiresAt: '2026-07-01T00:00:00.000Z',
                        daysRemaining: 20,
                        issuer: 'Example CA',
                        subject: 'example.test',
                    },
                },
            },
            {
                idempotencyKey: 'rejected-1',
                monitorId: 'foreign-monitor',
                isUp: false,
                responseTimeMs: 10,
                error: 'not assigned',
            },
        ], new Set(['monitor-1']));

        expect(acceptedResults).toHaveLength(1);
        expect(acceptedResults[0]).toMatchObject({
            idempotencyKey: 'accepted-1',
            monitorId: 'monitor-1',
            timestamp: new Date('2026-06-11T12:00:00.000Z'),
            isUp: true,
            responseTimeMs: 123,
            statusCode: 200,
            sslExpiresAt: new Date('2026-07-01T00:00:00.000Z'),
            sslDaysRemaining: 20,
            sslIssuer: 'Example CA',
            sslSubject: 'example.test',
        });
        expect(failed).toEqual([{
            idempotencyKey: 'rejected-1',
            reason: 'MONITOR_NOT_ASSIGNED_TO_AGENT',
        }]);
    });

    it('uses fallback timestamp for agent result payloads without checkedAt', () => {
        const fallbackTimestamp = new Date('2026-06-11T12:30:00.000Z');

        expect(buildAgentResultInput({
            idempotencyKey: 'fallback-time',
            monitorId: 'monitor-1',
            isUp: false,
            responseTimeMs: 456,
            error: 'timeout',
        }, fallbackTimestamp)).toMatchObject({
            timestamp: fallbackTimestamp,
            statusCode: null,
            error: 'timeout',
            sslExpiresAt: null,
            sslDaysRemaining: null,
            sslIssuer: null,
            sslSubject: null,
        });
    });

    it('builds flapping context from persisted agent result metadata', () => {
        expect(buildFlappingCheckContext({
            idempotencyKey: 'accepted-1',
            monitorId: 'monitor-1',
            timestamp: new Date('2026-06-11T12:00:00.000Z'),
            isUp: true,
            responseTimeMs: 123,
            statusCode: 200,
            error: null,
            sslExpiresAt: new Date('2026-07-01T00:00:00.000Z'),
            sslDaysRemaining: 20,
            sslIssuer: 'Example CA',
            sslSubject: 'example.test',
        }, 'agent-a')).toEqual({
            executorLabel: 'agent-a',
            statusCode: 200,
            responseTimeMs: 123,
            ssl: {
                expiresAt: '2026-07-01T00:00:00.000Z',
                daysRemaining: 20,
                issuer: 'Example CA',
                subject: 'example.test',
            },
        });
    });
});
