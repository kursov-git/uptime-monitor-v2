import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initApp } from '../index';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';

let app: FastifyInstance;

beforeAll(async () => {
    // Wait for the server to load all plugins and routes
    app = await initApp();
    await app.ready();
});

afterAll(async () => {
    // Teardown fastify
    await app.close();
});

beforeEach(async () => {
    // Clean up DB before each test
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
});

describe('Auth API (Integration)', () => {
    it('should reject login with wrong credentials', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'nonexistent',
                password: 'wrongpassword'
            }
        });

        expect(response.statusCode).toBe(401);
        expect(JSON.parse(response.body)).toHaveProperty('error', 'Invalid credentials');
    });

    it('should return a JWT token for valid login', async () => {
        // Create an admin user first
        const hashedPassword = await bcrypt.hash('secret123', 10);
        await prisma.user.create({
            data: {
                username: 'admin_test',
                passwordHash: hashedPassword,
                role: 'ADMIN',
            }
        });

        const response = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'admin_test',
                password: 'secret123'
            }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.body);
        expect(data).toHaveProperty('token');
        expect(data.user).toHaveProperty('id');
        expect(data.user.username).toBe('admin_test');
        expect(data.user.role).toBe('ADMIN');
    });

    it('should return 401 for protected routes without token', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/auth/me'
        });

        expect(response.statusCode).toBe(401);
    });

    it('should return user profile using valid JWT token in /me', async () => {
        const hashedPassword = await bcrypt.hash('secret123', 10);
        await prisma.user.create({
            data: {
                username: 'test_user2',
                passwordHash: hashedPassword,
                role: 'VIEWER',
            }
        });

        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'test_user2',
                password: 'secret123'
            }
        });

        const token = JSON.parse(loginRes.body).token;

        const response = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.body);
        expect(data.username).toBe('test_user2');
        expect(data.role).toBe('VIEWER');
    });
});
