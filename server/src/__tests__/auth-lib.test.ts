import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../lib/prisma';
import { authenticateJWT, authenticateSseJWT, blockApiKeyWrites, requireAdmin } from '../lib/auth';

beforeEach(async () => {
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
});

describe('authenticateSseJWT', () => {
    it('accepts cookie token for SSE clients', async () => {
        const user = await prisma.user.create({
            data: {
                id: 'user-1',
                username: 'alice',
                passwordHash: 'hash',
                role: 'ADMIN',
            },
        });
        const verify = vi.fn().mockResolvedValue({
            id: user.id,
            username: user.username,
            role: user.role,
            sessionVersion: user.sessionVersion,
        });
        const request = {
            headers: { cookie: 'auth_token=cookie-token' },
            server: { jwt: { verify } },
        } as unknown as FastifyRequest;
        const reply = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
        } as unknown as FastifyReply;

        await authenticateSseJWT(request, reply);

        expect(verify).toHaveBeenCalledWith('cookie-token');
        expect((request as any).user).toMatchObject({
            id: user.id,
            username: user.username,
            role: 'ADMIN',
            sessionVersion: 0,
        });
    });

    it('rejects invalid SSE cookie token', async () => {
        const request = {
            headers: { cookie: 'auth_token=bad-token' },
            server: { jwt: { verify: vi.fn().mockRejectedValue(new Error('bad token')) } },
        } as unknown as FastifyRequest;
        const send = vi.fn();
        const status = vi.fn().mockReturnValue({ send });
        const reply = {
            status,
            send,
        } as unknown as FastifyReply;

        await authenticateSseJWT(request, reply);

        expect(status).toHaveBeenCalledWith(401);
        expect(send).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('rejects stale cookie sessions after session version changes', async () => {
        const user = await prisma.user.create({
            data: {
                id: 'user-stale',
                username: 'stale-user',
                passwordHash: 'hash',
                role: 'VIEWER',
                sessionVersion: 1,
            },
        });
        const request = {
            headers: { cookie: 'auth_token=stale-token' },
            server: {
                jwt: {
                    verify: vi.fn().mockResolvedValue({
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        sessionVersion: 0,
                    }),
                },
            },
        } as unknown as FastifyRequest;
        const send = vi.fn();
        const status = vi.fn().mockReturnValue({ send });
        const reply = {
            status,
            send,
        } as unknown as FastifyReply;

        await authenticateSseJWT(request, reply);

        expect(status).toHaveBeenCalledWith(401);
        expect(send).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('authenticates with API key for non-SSE routes', async () => {
        const user = await prisma.user.create({
            data: {
                username: 'api-user',
                passwordHash: 'hash',
                role: 'VIEWER',
            },
        });
        await prisma.apiKey.create({
            data: {
                key: 'um_test_key',
                userId: user.id,
            },
        });

        const request = {
            headers: { 'x-api-key': 'um_test_key' },
        } as unknown as FastifyRequest;
        const reply = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
        } as unknown as FastifyReply;

        await authenticateJWT(request, reply);

        expect((request as any).user).toMatchObject({
            id: user.id,
            username: 'api-user',
            role: 'VIEWER',
            isApiKey: true,
        });
    });

    it('blocks admin-only routes for viewers and API keys', async () => {
        const reply = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
        } as unknown as FastifyReply;
        const viewerRequest = {
            user: { id: 'viewer-1', username: 'viewer', role: 'VIEWER' },
        } as unknown as FastifyRequest;

        await requireAdmin(viewerRequest, reply);
        expect((reply.status as any).mock.calls[0][0]).toBe(403);

        const apiKeyReply = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
        } as unknown as FastifyReply;
        const apiKeyRequest = {
            user: { id: 'viewer-1', username: 'viewer', role: 'VIEWER', isApiKey: true },
        } as unknown as FastifyRequest;

        await blockApiKeyWrites(apiKeyRequest, apiKeyReply);
        expect((apiKeyReply.status as any).mock.calls[0][0]).toBe(403);
    });
});
