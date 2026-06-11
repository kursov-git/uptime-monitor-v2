import { z } from 'zod';

export const isoDate = z.string().datetime();
export const uuid = z.string().uuid();

const serverRoleSchema = z.enum(['all', 'api', 'worker', 'retention', 'agent-offline-monitor']);

const runtimeFlagsSchema = z.object({
    agentApiEnabled: z.boolean(),
    agentSseEnabled: z.boolean(),
    builtinWorkerEnabled: z.boolean(),
});

const publicStatusCacheSchema = z.object({
    ttlSec: z.number(),
    hasSnapshot: z.boolean(),
    lastBuildAt: isoDate.nullable(),
    lastBuildDurationMs: z.number().nullable(),
    hitCount: z.number(),
    missCount: z.number(),
    staleServeCount: z.number(),
    refreshInFlight: z.boolean(),
    lastError: z.string().nullable(),
});

const workerStatusSchema = z.object({
    running: z.boolean(),
    scheduledMonitors: z.number(),
    syncLoopActive: z.boolean(),
    lastRefreshAt: isoDate.nullable(),
    lastRefreshDurationMs: z.number().nullable(),
    lastRefreshError: z.string().nullable(),
    lastCheckCompletedAt: isoDate.nullable(),
    lastCheckMonitorId: uuid.nullable(),
    lastCheckMonitorName: z.string().nullable(),
    lastCheckError: z.string().nullable(),
});

const retentionStatusSchema = z.object({
    running: z.boolean(),
    lastRunAt: isoDate.nullable(),
    lastDurationMs: z.number().nullable(),
    lastRetentionDays: z.number().nullable(),
    lastDeletedCheckResults: z.number(),
    lastDeletedAuditLogs: z.number(),
    lastDeletedNotificationHistory: z.number(),
    lastDeleteBatchCount: z.number(),
    lastBusyRetryCount: z.number(),
    lastError: z.string().nullable(),
});

const agentOfflineMonitorStatusSchema = z.object({
    running: z.boolean(),
    lastRunAt: isoDate.nullable(),
    lastDurationMs: z.number().nullable(),
    lastMarkedOfflineCount: z.number(),
    lastError: z.string().nullable(),
});

const clusterProcessBaseSchema = z.object({
    present: z.boolean(),
    fresh: z.boolean(),
    sourceRole: serverRoleSchema.nullable(),
    updatedAt: isoDate.nullable(),
    startedAt: isoDate.nullable(),
    hostname: z.string().nullable(),
    pid: z.number().nullable(),
    runtime: runtimeFlagsSchema.nullable(),
});

export const healthResponseSchema = z.object({
    status: z.literal('ok'),
    timestamp: isoDate,
});

export const runtimeHealthResponseSchema = z.object({
    status: z.literal('ok'),
    timestamp: isoDate,
    serverRole: serverRoleSchema,
    runtime: runtimeFlagsSchema,
    services: z.object({
        worker: workerStatusSchema,
        retention: retentionStatusSchema,
        agentOfflineMonitor: agentOfflineMonitorStatusSchema,
    }),
    streams: z.object({
        browserSse: z.object({
            currentClients: z.number(),
            maxClients: z.number(),
            totalAccepted: z.number(),
            totalRejected: z.number(),
            totalDisconnected: z.number(),
            failedWrites: z.number(),
            lastAcceptedAt: isoDate.nullable(),
            lastRejectedAt: isoDate.nullable(),
            lastDisconnectedAt: isoDate.nullable(),
            lastHeartbeatAt: isoDate.nullable(),
            lastBroadcastAt: isoDate.nullable(),
        }),
        agentSse: z.object({
            currentClients: z.number(),
            maxClients: z.number(),
            totalAccepted: z.number(),
            totalRejected: z.number(),
            totalDisconnected: z.number(),
            failedWrites: z.number(),
            totalReplayRequests: z.number(),
            totalReplayedEvents: z.number(),
            staleReplayRequests: z.number(),
            eventLogSize: z.number(),
            lastEventId: z.number(),
            lastAcceptedAt: isoDate.nullable(),
            lastRejectedAt: isoDate.nullable(),
            lastDisconnectedAt: isoDate.nullable(),
            lastReplayAt: isoDate.nullable(),
            lastStaleReplayAt: isoDate.nullable(),
            lastHeartbeatAt: isoDate.nullable(),
            lastPublishedAt: isoDate.nullable(),
        }),
    }),
    caches: z.object({
        publicStatus: publicStatusCacheSchema,
    }),
    cluster: z.object({
        api: clusterProcessBaseSchema.extend({
            caches: z.object({
                publicStatus: publicStatusCacheSchema,
            }).nullable(),
        }),
        worker: clusterProcessBaseSchema.extend({
            status: workerStatusSchema.nullable(),
        }),
        retention: clusterProcessBaseSchema.extend({
            status: retentionStatusSchema.nullable(),
        }),
        agentOfflineMonitor: clusterProcessBaseSchema.extend({
            status: agentOfflineMonitorStatusSchema.nullable(),
        }),
    }),
});

export const userSchema = z.object({
    id: uuid,
    username: z.string(),
    role: z.enum(['ADMIN', 'VIEWER']),
    createdAt: isoDate,
});

const flappingStateSchema = z.object({
    isFlapping: z.boolean(),
    consecutiveFailures: z.number(),
    firstFailureTime: isoDate.nullable(),
    lastError: z.string().nullable(),
});

export const monitorSchema = z.object({
    id: uuid,
    name: z.string(),
    serviceName: z.string().nullable(),
    type: z.enum(['HTTP', 'TCP', 'DNS']),
    url: z.string().url(),
    dnsRecordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']),
    method: z.string(),
    intervalSeconds: z.number(),
    timeoutSeconds: z.number(),
    expectedStatus: z.number(),
    expectedBody: z.string().nullable(),
    requestBody: z.string().nullable(),
    bodyAssertionType: z.enum(['NONE', 'AUTO', 'CONTAINS', 'REGEX', 'JSON_PATH_EQUALS', 'JSON_PATH_CONTAINS']),
    bodyAssertionPath: z.string().nullable(),
    headers: z.string().nullable(),
    authMethod: z.string(),
    authUrl: z.string().nullable(),
    authPayload: z.string().nullable(),
    authTokenRegex: z.string().nullable(),
    sslExpiryEnabled: z.boolean(),
    sslExpiryThresholdDays: z.number().int(),
    isActive: z.boolean(),
    isPublic: z.boolean(),
    createdAt: isoDate,
    updatedAt: isoDate,
    lastCheck: z.object({
        id: uuid,
        monitorId: uuid,
        timestamp: isoDate,
        isUp: z.boolean(),
        responseTimeMs: z.number(),
        statusCode: z.number().nullable(),
        error: z.string().nullable(),
        sslExpiresAt: isoDate.nullable().optional(),
        sslDaysRemaining: z.number().nullable().optional(),
        sslIssuer: z.string().nullable().optional(),
        sslSubject: z.string().nullable().optional(),
    }).nullable(),
    flappingState: flappingStateSchema.nullable().optional(),
});

const publicStatusBucketSchema = z.object({
    timestamp: isoDate,
    totalChecks: z.number(),
    upChecks: z.number(),
    uptimePercent: z.number().nullable(),
    avgResponseTimeMs: z.number().nullable(),
});

export const publicStatusSchema = z.object({
    generatedAt: isoDate,
    monitorCount: z.number(),
    summary: z.object({
        up: z.number(),
        down: z.number(),
        paused: z.number(),
        unknown: z.number(),
    }),
    history24h: z.array(publicStatusBucketSchema).length(24),
    monitors: z.array(z.object({
        id: uuid,
        name: z.string(),
        serviceName: z.string().nullable(),
        type: z.enum(['HTTP', 'TCP', 'DNS']),
        url: z.string().url(),
        dnsRecordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']),
        method: z.string(),
        isActive: z.boolean(),
        status: z.enum(['up', 'down', 'paused', 'unknown']),
        uptimePercent24h: z.string(),
        history24h: z.array(publicStatusBucketSchema).length(24),
        lastCheck: z.object({
            id: uuid,
            monitorId: uuid,
            timestamp: isoDate,
            isUp: z.boolean(),
            responseTimeMs: z.number(),
            statusCode: z.number().nullable(),
            error: z.string().nullable(),
        }).nullable(),
    })),
});

export const publicStatusDrilldownSchema = z.object({
    monitorId: uuid,
    monitorName: z.string(),
    windowStart: isoDate,
    windowEnd: isoDate,
    bucketSizeMinutes: z.number(),
    totalChecks: z.number(),
    upChecks: z.number(),
    uptimePercent: z.number().nullable(),
    history: z.array(publicStatusBucketSchema).length(12),
    failures: z.array(z.object({
        timestamp: isoDate,
        responseTimeMs: z.number(),
        statusCode: z.number().nullable(),
        error: z.string().nullable(),
    })),
});

export const agentJobsResponseSchema = z.object({
    serverTime: isoDate,
    heartbeatIntervalSec: z.number(),
    jobs: z.array(z.object({
        monitorId: uuid,
        type: z.enum(['HTTP', 'TCP', 'DNS']),
        url: z.string(),
        dnsRecordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']),
        method: z.string(),
        intervalSeconds: z.number(),
        timeoutMs: z.number(),
        expectedStatus: z.number(),
        expectedBody: z.string().nullable(),
        requestBody: z.string().nullable(),
        bodyAssertionType: z.enum(['NONE', 'AUTO', 'CONTAINS', 'REGEX', 'JSON_PATH_EQUALS', 'JSON_PATH_CONTAINS']),
        bodyAssertionPath: z.string().nullable(),
        headers: z.string().nullable(),
        authMethod: z.string(),
        authUrl: z.string().nullable(),
        authPayloadEncrypted: z.string().nullable(),
        authTokenRegex: z.string().nullable(),
        sslExpiryEnabled: z.boolean(),
        sslExpiryThresholdDays: z.number().int(),
        authPayloadIv: z.null(),
        authPayloadTag: z.null(),
        keyVersion: z.number().int(),
        version: z.number(),
    })),
});

export const agentResultsResponseSchema = z.object({
    acceptedCount: z.number(),
    duplicateCount: z.number(),
    failed: z.array(z.object({
        idempotencyKey: z.string(),
        reason: z.string(),
    })),
});

export const agentHeartbeatResponseSchema = z.object({
    now: isoDate,
    heartbeatIntervalSec: z.number(),
    commands: z.array(z.string()),
});
