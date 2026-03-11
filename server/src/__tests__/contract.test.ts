import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { initApp } from '../index';
import prisma from '../lib/prisma';

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
    url: z.string().url(),
    method: z.string(),
    intervalSeconds: z.number(),
    timeoutSeconds: z.number(),
    expectedStatus: z.number(),
    expectedBody: z.string().nullable(),
    headers: z.string().nullable(),
    authMethod: z.string(),
    authUrl: z.string().nullable(),
    authPayload: z.string().nullable(),
    authTokenRegex: z.string().nullable(),
    isActive: z.boolean(),
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
    }).nullable(),
    flappingState: z.any().nullable().optional(),
});

function normalizeForSnapshot<T extends Record<string, any>>(input: T): T {
    return JSON.parse(JSON.stringify(input, (_, value) => {
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
    return app.jwt.sign({ id: admin.id, username: admin.username, role: admin.role });
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
                }),
                retention: z.object({
                    running: z.boolean(),
                }),
                agentOfflineMonitor: z.object({
                    running: z.boolean(),
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
            token: z.string(),
            user: userSchema.pick({ id: true, username: true, role: true }),
        }).parse(JSON.parse(loginRes.body));

        const meRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: { Authorization: `Bearer ${loginBody.token}` },
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
            },
        });

        await prisma.checkResult.create({
            data: {
                monitorId: monitor.id,
                isUp: true,
                responseTimeMs: 37,
                statusCode: 200,
                error: null,
            },
        });

        const monitorsRes = await app.inject({
            method: 'GET',
            url: '/api/monitors/',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(monitorsRes.statusCode).toBe(200);
        const monitorsBody = z.array(monitorSchema).parse(JSON.parse(monitorsRes.body));

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
            })),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
            overallUptimePercent: z.string(),
            overallAvgResponseMs: z.number(),
        }).parse(JSON.parse(statsRes.body));

        expect(normalizeForSnapshot({
            monitor: monitorsBody[0],
            stats: { ...statsBody, results: statsBody.results.map(r => ({ ...r, timestamp: r.timestamp.toISOString() })) },
        })).toMatchSnapshot();
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
                key: z.string(),
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
