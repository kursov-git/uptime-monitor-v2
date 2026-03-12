import type { FastifyRequest } from 'fastify';

export const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_MAX_AGE_SEC = 24 * 60 * 60;

function parseCookieHeader(header: string | undefined): Record<string, string> {
    if (!header) {
        return {};
    }

    return header
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, part) => {
            const separatorIndex = part.indexOf('=');
            if (separatorIndex === -1) {
                return acc;
            }

            const key = part.slice(0, separatorIndex).trim();
            const value = part.slice(separatorIndex + 1).trim();
            acc[key] = decodeURIComponent(value);
            return acc;
        }, {});
}

export function getAuthCookieToken(request: FastifyRequest): string | null {
    const cookies = parseCookieHeader(request.headers.cookie);
    return cookies[AUTH_COOKIE_NAME] || null;
}

export function buildAuthCookie(token: string, secure: boolean): string {
    const parts = [
        `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${AUTH_COOKIE_MAX_AGE_SEC}`,
    ];

    if (secure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

export function buildClearedAuthCookie(secure: boolean): string {
    const parts = [
        `${AUTH_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ];

    if (secure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}
