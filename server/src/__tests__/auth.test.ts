import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initApp } from '../index';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import { AUTH_COOKIE_MAX_AGE_SEC } from '../lib/authCookies';

let app: FastifyInstance;

type TestUser = {
    id: string;
    username: string;
    role: 'ADMIN' | 'VIEWER';
    sessionVersion: number;
};

function getCookieHeader(setCookie: string | string[] | undefined): string {
    const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (!value) {
        throw new Error('Missing Set-Cookie header');
    }

    return value;
}

function getAuthTokenFromSetCookie(setCookie: string | string[] | undefined): string {
    const cookieHeader = getCookieHeader(setCookie);
    const match = cookieHeader.match(/auth_token=([^;]+)/);
    if (!match) {
        throw new Error('Missing auth_token cookie');
    }

    return decodeURIComponent(match[1]);
}

async function createUser(username: string, password: string, role: TestUser['role'] = 'VIEWER') {
    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.user.create({
        data: {
            username,
            passwordHash,
            role,
        },
    });
}

async function createAdminToken(username: string) {
    const admin = await createUser(username, 'admin123', 'ADMIN');
    return app.jwt.sign({
        id: admin.id,
        username: admin.username,
        role: admin.role,
        sessionVersion: admin.sessionVersion,
    });
}

beforeAll(async () => {
    app = await initApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

beforeEach(async () => {
    await prisma.apiKey.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
});

describe('Auth API (Integration)', () => {
    it('rejects login with wrong credentials', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'nonexistent',
                password: 'wrongpassword',
            },
        });

        expect(response.statusCode).toBe(401);
        expect(JSON.parse(response.body)).toHaveProperty('error', 'Invalid credentials');
    });

    it('logs in with cookie-only session response and 12h TTL', async () => {
        await createUser('admin_login', 'secret123', 'ADMIN');

        const response = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'admin_login',
                password: 'secret123',
            },
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.body);
        expect(data).not.toHaveProperty('token');
        expect(data.user).toMatchObject({
            username: 'admin_login',
            role: 'ADMIN',
        });

        const setCookie = getCookieHeader(response.headers['set-cookie']);
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toContain('SameSite=Strict');
        expect(setCookie).toContain(`Max-Age=${AUTH_COOKIE_MAX_AGE_SEC}`);

        const token = getAuthTokenFromSetCookie(response.headers['set-cookie']);
        const decoded = await app.jwt.verify<{
            id: string;
            username: string;
            role: string;
            sessionVersion: number;
            iat: number;
            exp: number;
        }>(token);

        expect(decoded.username).toBe('admin_login');
        expect(decoded.role).toBe('ADMIN');
        expect(decoded.sessionVersion).toBe(0);
        expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(AUTH_COOKIE_MAX_AGE_SEC);
        expect(decoded.exp - decoded.iat).toBeGreaterThan(AUTH_COOKIE_MAX_AGE_SEC - 5);
    });

    it('returns 401 for protected routes without authentication', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
        });

        expect(response.statusCode).toBe(401);
    });

    it('returns user profile using a valid bearer token from the session cookie', async () => {
        await createUser('bearer_user', 'secret123');

        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'bearer_user',
                password: 'secret123',
            },
        });

        const token = getAuthTokenFromSetCookie(loginRes.headers['set-cookie']);
        const response = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.body);
        expect(data.username).toBe('bearer_user');
        expect(data.role).toBe('VIEWER');
    });

    it('returns user profile using the auth cookie in /me', async () => {
        await createUser('cookie_user', 'secret123');

        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'cookie_user',
                password: 'secret123',
            },
        });

        const response = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
                cookie: getCookieHeader(loginRes.headers['set-cookie']),
            },
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.body);
        expect(data.username).toBe('cookie_user');
        expect(data.role).toBe('VIEWER');
    });

    it('rate-limits repeated login attempts for the same ip and username', async () => {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const response = await app.inject({
                method: 'POST',
                url: '/api/auth/login',
                payload: {
                    username: 'rate_limit_user',
                    password: 'wrongpassword',
                },
            });

            expect(response.statusCode).toBe(401);
        }

        const blocked = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'rate_limit_user',
                password: 'wrongpassword',
            },
        });

        expect(blocked.statusCode).toBe(429);
        expect(JSON.parse(blocked.body)).toEqual({
            statusCode: 429,
            error: 'Too many login attempts. Please try again later.',
        });
    });

    it('locks a user account after repeated failed password attempts', async () => {
        const user = await createUser('locked_user', 'secret123');

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const response = await app.inject({
                method: 'POST',
                url: '/api/auth/login',
                payload: {
                    username: 'locked_user',
                    password: 'wrongpassword',
                },
            });

            expect(response.statusCode).toBe(401);
        }

        const lockedResponse = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'locked_user',
                password: 'secret123',
            },
        });

        expect(lockedResponse.statusCode).toBe(429);
        expect(JSON.parse(lockedResponse.body)).toEqual({
            statusCode: 429,
            error: 'Too many login attempts. Please try again later.',
        });

        const refreshedUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { failedLoginAttempts: true, lockedUntil: true },
        });
        expect(refreshedUser?.failedLoginAttempts).toBe(5);
        expect(refreshedUser?.lockedUntil).toBeTruthy();
    });

    it('revokes the current session on logout', async () => {
        await createUser('logout_user', 'secret123');

        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'logout_user',
                password: 'secret123',
            },
        });

        const cookie = getCookieHeader(loginRes.headers['set-cookie']);
        const token = getAuthTokenFromSetCookie(loginRes.headers['set-cookie']);

        const logoutRes = await app.inject({
            method: 'POST',
            url: '/api/auth/logout',
            headers: {
                cookie,
            },
        });

        expect(logoutRes.statusCode).toBe(200);
        expect(getCookieHeader(logoutRes.headers['set-cookie'])).toContain('Max-Age=0');

        const cookieRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
                cookie,
            },
        });
        expect(cookieRes.statusCode).toBe(401);

        const bearerRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
                authorization: `Bearer ${token}`,
            },
        });
        expect(bearerRes.statusCode).toBe(401);
    });

    it('revokes active sessions when an admin changes the password', async () => {
        const viewer = await createUser('password_target', 'secret123');
        const adminToken = await createAdminToken('password_admin');

        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'password_target',
                password: 'secret123',
            },
        });

        const oldToken = getAuthTokenFromSetCookie(loginRes.headers['set-cookie']);

        const changeRes = await app.inject({
            method: 'PATCH',
            url: `/api/users/${viewer.id}/password`,
            headers: {
                authorization: `Bearer ${adminToken}`,
            },
            payload: {
                password: 'newsecret123',
            },
        });
        expect(changeRes.statusCode).toBe(200);

        const oldSessionRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
                authorization: `Bearer ${oldToken}`,
            },
        });
        expect(oldSessionRes.statusCode).toBe(401);

        const oldPasswordLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'password_target',
                password: 'secret123',
            },
        });
        expect(oldPasswordLogin.statusCode).toBe(401);

        const newPasswordLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'password_target',
                password: 'newsecret123',
            },
        });
        expect(newPasswordLogin.statusCode).toBe(200);
    });

    it('revokes active sessions when an admin changes the role', async () => {
        const viewer = await createUser('role_target', 'secret123');
        const adminToken = await createAdminToken('role_admin');

        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'role_target',
                password: 'secret123',
            },
        });

        const oldToken = getAuthTokenFromSetCookie(loginRes.headers['set-cookie']);

        const changeRes = await app.inject({
            method: 'PATCH',
            url: `/api/users/${viewer.id}/role`,
            headers: {
                authorization: `Bearer ${adminToken}`,
            },
            payload: {
                role: 'ADMIN',
            },
        });
        expect(changeRes.statusCode).toBe(200);
        expect(JSON.parse(changeRes.body)).toMatchObject({
            id: viewer.id,
            username: 'role_target',
            role: 'ADMIN',
        });

        const oldSessionRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
                authorization: `Bearer ${oldToken}`,
            },
        });
        expect(oldSessionRes.statusCode).toBe(401);

        const newLogin = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'role_target',
                password: 'secret123',
            },
        });
        expect(newLogin.statusCode).toBe(200);
        expect(JSON.parse(newLogin.body).user.role).toBe('ADMIN');
    });

    it('revokes active sessions when a user is deleted', async () => {
        const viewer = await createUser('delete_target', 'secret123');
        const adminToken = await createAdminToken('delete_admin');

        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
                username: 'delete_target',
                password: 'secret123',
            },
        });

        const token = getAuthTokenFromSetCookie(loginRes.headers['set-cookie']);

        const deleteRes = await app.inject({
            method: 'DELETE',
            url: `/api/users/${viewer.id}`,
            headers: {
                authorization: `Bearer ${adminToken}`,
            },
        });
        expect(deleteRes.statusCode).toBe(200);

        const oldSessionRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: {
                authorization: `Bearer ${token}`,
            },
        });
        expect(oldSessionRes.statusCode).toBe(401);
    });
});
