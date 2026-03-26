import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { initApp } from '../index';
import prisma from '../lib/prisma';
import { hashAgentToken } from '../services/agentAuth';

const isoDate = z.string().datetime();
const uuid = z.string().uuid();

const userSchema = z.object({
    id: uuid,
    username: z.string(),
    role: z.enum(['ADMIN', 'VIEWER']),
    createdAt: isoDate,
});

const monitorSchema = z.object({
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
    flappingState: z.any().nullable().optional(),
});

const publicStatusBucketSchema = z.object({
    timestamp: isoDate,
    totalChecks: z.number(),
    upChecks: z.number(),
    uptimePercent: z.number().nullable(),
    avgResponseTimeMs: z.number().nullable(),
});

const publicStatusSchema = z.object({
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

const publicStatusDrilldownSchema = z.object({
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

const agentJobsResponseSchema = z.object({
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

const agentResultsResponseSchema = z.object({
    acceptedCount: z.number(),
    duplicateCount: z.number(),
    failed: z.array(z.object({
        idempotencyKey: z.string(),
        reason: z.string(),
    })),
});

const agentHeartbeatResponseSchema = z.object({
    now: isoDate,
    heartbeatIntervalSec: z.number(),
    commands: z.array(z.string()),
});

function normalizeForSnapshot<T extends Record<string, any>>(input: T): T {
    return JSON.parse(JSON.stringify(input, (key, value) => {
        if (key === 'version' && typeof value === 'number') {
            return '<version>';
        }
        if (typeof value === 'string') {
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
                return '<uuid>';
            }
            if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
                return '<iso-date>';
            }
            if (value.startsWith('um_')) {
                return '<api-key>';
            }
            if (value.split('.').length === 3 && value.length > 30) {
                return '<jwt>';
            }
        }
        return value;
    })) as T;
}

let app: FastifyInstance;

beforeAll(async () => {
    app = await initApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

beforeEach(async () => {
    await prisma.notificationHistory.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
    await prisma.notificationSettings.deleteMany();
});

async function createAdminToken() {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.create({
        data: { username: 'contract_admin', passwordHash, role: 'ADMIN' },
    });
    return app.jwt.sign({
        id: admin.id,
        username: admin.username,
        role: admin.role,
        sessionVersion: admin.sessionVersion,
    });
}

async function createAgentToken(name: string, heartbeatIntervalSec = 20) {
    const token = `${name}-token-${crypto.randomUUID()}`;
    const agent = await prisma.agent.create({
        data: {
            name,
            tokenHash: hashAgentToken(token),
            heartbeatIntervalSec,
        },
    });

    return { agent, token };
}

describe('API Contract', () => {
    it('validates /health response shape', async () => {
        const res = await app.inject({ method: 'GET', url: '/health' });
        expect(res.statusCode).toBe(200);

        const body = JSON.parse(res.body);
        const parsed = z.object({
            status: z.literal('ok'),
            timestamp: isoDate,
        }).parse(body);

        expect(normalizeForSnapshot(parsed)).toMatchSnapshot();
    });

    it('validates /health/runtime response shape', async () => {
        const res = await app.inject({ method: 'GET', url: '/health/runtime' });
        expect(res.statusCode).toBe(200);

        const body = JSON.parse(res.body);
        const parsed = z.object({
            status: z.literal('ok'),
            timestamp: isoDate,
            serverRole: z.enum(['all', 'api', 'worker', 'retention', 'agent-offline-monitor']),
            runtime: z.object({
                agentApiEnabled: z.boolean(),
                agentSseEnabled: z.boolean(),
                builtinWorkerEnabled: z.boolean(),
            }),
            services: z.object({
                worker: z.object({
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
                }),
                retention: z.object({
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
                }),
                agentOfflineMonitor: z.object({
                    running: z.boolean(),
                    lastRunAt: isoDate.nullable(),
                    lastDurationMs: z.number().nullable(),
                    lastMarkedOfflineCount: z.number(),
                    lastError: z.string().nullable(),
                }),
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
        }).parse(body);

        expect(normalizeForSnapshot(parsed)).toMatchSnapshot();
    });

    it('validates auth login and /me contracts', async () => {
        const passwordHash = await bcrypt.hash('secret123', 10);
        await prisma.user.create({
            data: { username: 'contract_user', passwordHash, role: 'VIEWER' },
        });

        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { username: 'contract_user', password: 'secret123' },
        });

        expect(loginRes.statusCode).toBe(200);
        const loginBody = z.object({
            user: userSchema.pick({ id: true, username: true, role: true }),
        }).parse(JSON.parse(loginRes.body));
        const setCookie = loginRes.headers['set-cookie'];
        const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        expect(cookieHeader).toBeTruthy();

        const meRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: { cookie: cookieHeader as string },
        });

        expect(meRes.statusCode).toBe(200);
        const meBody = userSchema.parse(JSON.parse(meRes.body));

        expect(normalizeForSnapshot({ login: loginBody, me: meBody })).toMatchSnapshot();
    });

    it('validates monitors list and stats contracts', async () => {
        const adminToken = await createAdminToken();
        const monitor = await prisma.monitor.create({
            data: {
                name: 'Contract Monitor',
                url: 'https://example.com/contract',
                method: 'GET',
                intervalSeconds: 60,
                timeoutSeconds: 30,
                expectedStatus: 200,
                sslExpiryEnabled: true,
                sslExpiryThresholdDays: 14,
            },
        });

        await prisma.checkResult.create({
            data: {
                monitorId: monitor.id,
                isUp: true,
                responseTimeMs: 37,
                statusCode: 200,
                error: null,
                sslExpiresAt: new Date('2026-06-10T12:00:00.000Z'),
                sslDaysRemaining: 89,
                sslIssuer: 'Let\'s Encrypt E7',
                sslSubject: 'example.com',
            },
        });

        const monitorsRes = await app.inject({
            method: 'GET',
            url: '/api/monitors/',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(monitorsRes.statusCode).toBe(200);
        const monitorsBody = z.array(monitorSchema).parse(JSON.parse(monitorsRes.body));

        const monitorRes = await app.inject({
            method: 'GET',
            url: `/api/monitors/${monitor.id}`,
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(monitorRes.statusCode).toBe(200);
        const monitorBody = monitorSchema.parse(JSON.parse(monitorRes.body));

        const statsRes = await app.inject({
            method: 'GET',
            url: `/api/monitors/${monitor.id}/stats?limit=10&offset=0`,
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(statsRes.statusCode).toBe(200);
        const statsBody = z.object({
            results: z.array(z.object({
                id: uuid,
                monitorId: uuid,
                timestamp: z.coerce.date(),
                isUp: z.boolean(),
                responseTimeMs: z.number(),
                statusCode: z.number().nullable(),
                error: z.string().nullable(),
                sslExpiresAt: isoDate.nullable().optional(),
                sslDaysRemaining: z.number().nullable().optional(),
                sslIssuer: z.string().nullable().optional(),
                sslSubject: z.string().nullable().optional(),
            })),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
            overallUptimePercent: z.string(),
            overallAvgResponseMs: z.number(),
        }).parse(JSON.parse(statsRes.body));

        expect(normalizeForSnapshot({
            monitor: monitorsBody[0],
            monitorDetail: monitorBody,
            stats: { ...statsBody, results: statsBody.results.map(r => ({ ...r, timestamp: r.timestamp.toISOString() })) },
        })).toMatchSnapshot();
    });

    it('validates agent protocol contracts', async () => {
        const { agent, token } = await createAgentToken('contract-agent', 17);

        const assignedMonitor = await prisma.monitor.create({
            data: {
                name: 'Agent Contract Monitor',
                serviceName: 'Authentication',
                url: 'https://example.com/agent-contract',
                type: 'HTTP',
                method: 'POST',
                intervalSeconds: 30,
                timeoutSeconds: 15,
                expectedStatus: 202,
                expectedBody: '{"ok":true}',
                requestBody: '{"ping":"pong"}',
                bodyAssertionType: 'JSON_PATH_EQUALS',
                bodyAssertionPath: 'ok',
                headers: '{"Content-Type":"application/json"}',
                authMethod: 'NONE',
                authUrl: null,
                authPayload: null,
                authTokenRegex: null,
                sslExpiryEnabled: true,
                sslExpiryThresholdDays: 21,
                agentId: agent.id,
            },
        });

        const jobsRes = await app.inject({
            method: 'GET',
            url: '/api/agent/jobs',
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(jobsRes.statusCode).toBe(200);
        const jobsBody = agentJobsResponseSchema.parse(JSON.parse(jobsRes.body));

        const resultsRes = await app.inject({
            method: 'POST',
            url: '/api/agent/results',
            headers: { Authorization: `Bearer ${token}` },
            payload: {
                results: [{
                    idempotencyKey: 'agent-contract-result-001',
                    monitorId: assignedMonitor.id,
                    checkedAt: '2026-03-23T08:10:00.000Z',
                    isUp: true,
                    responseTimeMs: 118,
                    statusCode: 202,
                    meta: {
                        ssl: {
                            expiresAt: '2026-06-10T12:00:00.000Z',
                            daysRemaining: 89,
                            issuer: 'Let\'s Encrypt E7',
                            subject: 'example.com',
                        },
                    },
                }],
            },
        });
        expect(resultsRes.statusCode).toBe(200);
        const resultsBody = agentResultsResponseSchema.parse(JSON.parse(resultsRes.body));

        const heartbeatRes = await app.inject({
            method: 'POST',
            url: '/api/agent/heartbeat',
            headers: { Authorization: `Bearer ${token}` },
            payload: {
                agentVersion: '1.0.0',
                queueSize: 1,
                inFlightChecks: 0,
            },
        });
        expect(heartbeatRes.statusCode).toBe(200);
        const heartbeatBody = agentHeartbeatResponseSchema.parse(JSON.parse(heartbeatRes.body));

        expect(normalizeForSnapshot({
            jobs: jobsBody,
            results: resultsBody,
            heartbeat: heartbeatBody,
        })).toMatchSnapshot();
    });

    it('validates public status contract without authentication', async () => {
        const publicMonitor = await prisma.monitor.create({
            data: {
                name: 'Public Monitor',
                url: 'https://example.com/public',
                method: 'GET',
                isPublic: true,
            },
        });

        await prisma.monitor.create({
            data: {
                name: 'Private Monitor',
                url: 'https://example.com/private',
                method: 'GET',
                isPublic: false,
            },
        });

        await prisma.checkResult.create({
            data: {
                monitorId: publicMonitor.id,
                isUp: true,
                responseTimeMs: 84,
                statusCode: 200,
            },
        });

        await prisma.checkResult.create({
            data: {
                monitorId: publicMonitor.id,
                isUp: false,
                responseTimeMs: 210,
                statusCode: 503,
                error: 'Service unavailable',
                timestamp: new Date(Date.now() - 60 * 60 * 1000),
            },
        });

        const publicRes = await app.inject({
            method: 'GET',
            url: '/api/public/status',
        });

        expect(publicRes.statusCode).toBe(200);
        const publicBody = publicStatusSchema.parse(JSON.parse(publicRes.body));
        expect(publicBody.monitorCount).toBe(1);
        expect(publicBody.monitors).toHaveLength(1);
        expect(publicBody.monitors[0].name).toBe('Public Monitor');

        expect(normalizeForSnapshot(publicBody)).toMatchSnapshot();
    });

    it('validates public status drilldown contract without authentication', async () => {
        const hourStart = new Date();
        hourStart.setUTCMinutes(0, 0, 0);

        const publicMonitor = await prisma.monitor.create({
            data: {
                name: 'Public Drilldown Monitor',
                url: 'https://example.com/public-drilldown',
                method: 'GET',
                isPublic: true,
            },
        });

        await prisma.checkResult.createMany({
            data: [
                {
                    monitorId: publicMonitor.id,
                    isUp: true,
                    responseTimeMs: 110,
                    statusCode: 200,
                    timestamp: new Date(hourStart.getTime() + 5 * 60 * 1000),
                },
                {
                    monitorId: publicMonitor.id,
                    isUp: false,
                    responseTimeMs: 480,
                    statusCode: 503,
                    error: 'Service unavailable',
                    timestamp: new Date(hourStart.getTime() + 20 * 60 * 1000),
                },
            ],
        });

        const drilldownRes = await app.inject({
            method: 'GET',
            url: `/api/public/status/${publicMonitor.id}/drilldown?start=${encodeURIComponent(hourStart.toISOString())}`,
        });

        expect(drilldownRes.statusCode).toBe(200);
        const drilldownBody = publicStatusDrilldownSchema.parse(JSON.parse(drilldownRes.body));
        expect(drilldownBody.monitorName).toBe('Public Drilldown Monitor');
        expect(drilldownBody.failures).toHaveLength(1);
        expect(drilldownBody.history).toHaveLength(12);
    });

    it('validates users and audit contracts', async () => {
        const adminToken = await createAdminToken();

        const createUserRes = await app.inject({
            method: 'POST',
            url: '/api/users',
            headers: { Authorization: `Bearer ${adminToken}` },
            payload: { username: 'viewer_contract', password: 'viewer123', role: 'VIEWER' },
        });
        expect(createUserRes.statusCode).toBe(201);

        const usersRes = await app.inject({
            method: 'GET',
            url: '/api/users',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(usersRes.statusCode).toBe(200);
        const usersBody = z.array(userSchema.extend({
            apiKey: z.object({
                id: uuid,
                createdAt: isoDate,
                revokedAt: isoDate.nullable(),
            }).nullable(),
        })).parse(JSON.parse(usersRes.body));

        const auditRes = await app.inject({
            method: 'GET',
            url: '/api/audit?limit=10&offset=0',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(auditRes.statusCode).toBe(200);
        const auditBody = z.object({
            logs: z.array(z.object({
                id: uuid,
                action: z.string(),
                details: z.string().nullable(),
                userId: uuid.nullable(),
                ipAddress: z.string().nullable(),
                timestamp: z.coerce.date(),
                user: z.object({ username: z.string() }).nullable(),
            })),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
        }).parse(JSON.parse(auditRes.body));

        expect(normalizeForSnapshot({
            users: usersBody,
            audit: { ...auditBody, logs: auditBody.logs.map(l => ({ ...l, timestamp: l.timestamp.toISOString() })) },
        })).toMatchSnapshot();
    });

    it('validates notifications history and API key contracts', async () => {
        const adminToken = await createAdminToken();
        const monitor = await prisma.monitor.create({
            data: {
                name: 'Notify Contract',
                url: 'https://example.com/notify',
                method: 'GET',
            },
        });
        await prisma.notificationHistory.create({
            data: { monitorId: monitor.id, channel: 'TELEGRAM', status: 'SUCCESS' },
        });

        const historyRes = await app.inject({
            method: 'GET',
            url: '/api/notifications/history?page=1&limit=20',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(historyRes.statusCode).toBe(200);
        const historyBody = z.object({
            history: z.array(z.object({
                id: uuid,
                monitorId: uuid.nullable(),
                channel: z.string(),
                status: z.string(),
                error: z.string().nullable(),
                timestamp: z.coerce.date(),
            })),
            pagination: z.object({
                total: z.number(),
                page: z.number(),
                limit: z.number(),
                totalPages: z.number(),
            }),
        }).parse(JSON.parse(historyRes.body));

        const generateRes = await app.inject({
            method: 'POST',
            url: '/api/apikeys/generate',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(generateRes.statusCode).toBe(200);
        const keyBody = z.object({
            id: uuid,
            key: z.string(),
            userId: uuid,
            createdAt: z.coerce.date(),
            revokedAt: z.coerce.date().nullable(),
        }).parse(JSON.parse(generateRes.body));

        const meRes = await app.inject({
            method: 'GET',
            url: '/api/apikeys/me',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(meRes.statusCode).toBe(200);

        expect(normalizeForSnapshot({
            history: {
                ...historyBody,
                history: historyBody.history.map(h => ({ ...h, timestamp: h.timestamp.toISOString() })),
            },
            key: { ...keyBody, createdAt: keyBody.createdAt.toISOString() },
            me: JSON.parse(meRes.body),
        })).toMatchSnapshot();
    });
});
