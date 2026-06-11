import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { resetLoginAbuseTrackingForTests } from '../routes/auth';

export type AuthTestUser = {
    id: string;
    username: string;
    role: 'ADMIN' | 'VIEWER';
    sessionVersion: number;
};

export function getCookieHeader(setCookie: string | string[] | undefined): string {
    const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (!value) {
        throw new Error('Missing Set-Cookie header');
    }

    return value;
}

export function getAuthTokenFromSetCookie(setCookie: string | string[] | undefined): string {
    const cookieHeader = getCookieHeader(setCookie);
    const match = cookieHeader.match(/auth_token=([^;]+)/);
    if (!match) {
        throw new Error('Missing auth_token cookie');
    }

    return decodeURIComponent(match[1]);
}

export async function createUser(
    username: string,
    password: string,
    role: AuthTestUser['role'] = 'VIEWER',
): Promise<AuthTestUser> {
    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.user.create({
        data: {
            username,
            passwordHash,
            role,
        },
    });
}

export function signAuthToken(app: FastifyInstance, user: AuthTestUser): string {
    return app.jwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        sessionVersion: user.sessionVersion,
    });
}

export async function createAdminToken(app: FastifyInstance, username: string): Promise<string> {
    const admin = await createUser(username, 'admin123', 'ADMIN');
    return signAuthToken(app, admin);
}

export async function resetAuthTestState(): Promise<void> {
    resetLoginAbuseTrackingForTests();
    await prisma.apiKey.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
}
