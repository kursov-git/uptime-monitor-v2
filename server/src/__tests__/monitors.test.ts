import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initApp } from '../index';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';

let app: FastifyInstance;
let adminToken: string;
let viewerToken: string;

beforeAll(async () => {
    app = await initApp();
    await app.ready();

    // Create test users
    const passwordHash = await bcrypt.hash('password123', 10);

    // Clean up first
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();

    const admin = await prisma.user.create({
        data: { username: 'admin_mon', passwordHash, role: 'ADMIN' }
    });

    const viewer = await prisma.user.create({
        data: { username: 'viewer_mon', passwordHash, role: 'VIEWER' }
    });

    adminToken = app.jwt.sign({ id: admin.id, username: admin.username, role: admin.role });
    viewerToken = app.jwt.sign({ id: viewer.id, username: viewer.username, role: viewer.role });
});

afterAll(async () => {
    await app.close();
});

beforeEach(async () => {
    // Clear monitors before each test
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
});

describe('Monitors API (Integration)', () => {
    it('should allow ADMIN to create monitor', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/monitors/',
            headers: { Authorization: `Bearer ${adminToken}` },
            payload: {
                name: 'Test Monitor',
                url: 'https://example.com',
                method: 'GET',
                intervalSeconds: 60,
                timeoutSeconds: 30,
                expectedStatus: 200
            }
        });

        expect(res.statusCode).toBe(201);
        const data = JSON.parse(res.body);
        expect(data.name).toBe('Test Monitor');
        expect(data.id).toBeDefined();
    });

    it('should reject private monitor targets by default', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/monitors/',
            headers: { Authorization: `Bearer ${adminToken}` },
            payload: {
                name: 'Internal Target',
                url: 'http://127.0.0.1:8080/health',
                method: 'GET',
            }
        });

        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).errors).toContainEqual({
            field: 'url',
            message: 'Target URL is not allowed: loopback',
        });
    });

    it('should reject private auth URLs on monitor update', async () => {
        const monitor = await prisma.monitor.create({
            data: {
                name: 'Auth Target',
                url: 'https://example.com/health',
                method: 'GET',
                authMethod: 'NONE',
            }
        });

        const res = await app.inject({
            method: 'PUT',
            url: `/api/monitors/${monitor.id}`,
            headers: { Authorization: `Bearer ${adminToken}` },
            payload: {
                authMethod: 'FORM_LOGIN',
                authUrl: 'http://192.168.1.15/login',
                authPayload: '{"username":"alice","password":"secret"}',
            }
        });

        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).errors).toContainEqual({
            field: 'authUrl',
            message: 'Auth URL is not allowed: rfc1918-private',
        });
    });

    it('should FORBID VIEWER from creating monitors', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/monitors/',
            headers: { Authorization: `Bearer ${viewerToken}` },
            payload: {
                name: 'Hacker Monitor',
                url: 'https://hacker.com',
                method: 'GET'
            }
        });

        expect(res.statusCode).toBe(403);
    });

    it('should list monitors for any authenticated user', async () => {
        // Create one first
        await prisma.monitor.create({
            data: {
                name: 'Exist',
                url: 'http://test.com',
                method: 'GET'
            }
        });

        const res = await app.inject({
            method: 'GET',
            url: '/api/monitors/',
            headers: { Authorization: `Bearer ${viewerToken}` }
        });

        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(1);
        expect(data[0].name).toBe('Exist');
    });

    it('should reject unauthenticated access', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/monitors/'
        });

        expect(res.statusCode).toBe(401);
    });

    it('should reject JWT query token on regular REST endpoints', async () => {
        await prisma.monitor.create({
            data: { name: 'Query Token Monitor', url: 'http://query-token.test', method: 'GET' }
        });

        const res = await app.inject({
            method: 'GET',
            url: `/api/monitors/?token=${adminToken}`,
        });

        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).error).toBe('Authentication required');
    });

    it('should reject invalid JWT query token', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/monitors/?token=this-is-not-a-valid-jwt',
        });

        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).error).toBe('Authentication required');
    });

    it('should allow API key read access but block write operations', async () => {
        const generateKeyRes = await app.inject({
            method: 'POST',
            url: '/api/apikeys/generate',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(generateKeyRes.statusCode).toBe(200);
        const apiKey = JSON.parse(generateKeyRes.body).key as string;
        expect(apiKey.startsWith('um_')).toBe(true);

        const readRes = await app.inject({
            method: 'GET',
            url: '/api/monitors/',
            headers: { 'x-api-key': apiKey },
        });
        expect(readRes.statusCode).toBe(200);

        const writeRes = await app.inject({
            method: 'POST',
            url: '/api/monitors/',
            headers: { 'x-api-key': apiKey },
            payload: {
                name: 'Blocked By API Key',
                url: 'https://example.com',
                method: 'GET',
            },
        });

        expect(writeRes.statusCode).toBe(403);
        expect(JSON.parse(writeRes.body).error).toBe('API keys are read-only');
    });

    it('should allow ADMIN to delete a monitor', async () => {
        const monitor = await prisma.monitor.create({
            data: { name: 'To Delete', url: 'http://test.com', method: 'GET' }
        });

        const res = await app.inject({
            method: 'DELETE',
            url: `/api/monitors/${monitor.id}`,
            headers: { Authorization: `Bearer ${adminToken}` }
        });

        expect(res.statusCode).toBe(200);

        const check = await prisma.monitor.findUnique({ where: { id: monitor.id } });
        expect(check).toBeNull();
    });
});
