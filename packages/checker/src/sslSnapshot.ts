import type { AxiosResponse } from 'axios';
import tls from 'node:tls';

export interface SslCheckSnapshot {
    expiresAt: string | null;
    daysRemaining: number | null;
    issuer: string | null;
    subject: string | null;
}

type ResponseWithSocket = AxiosResponse & {
    socket?: unknown;
    request?: {
        socket?: unknown;
        res?: {
            responseUrl?: unknown;
            socket?: unknown;
        };
    };
};

type PeerCertificateLike = {
    valid_to?: string;
    issuer?: Record<string, string>;
    subject?: Record<string, string>;
};

type SslSnapshotInput = {
    sslExpiryEnabled?: boolean;
    timeoutSeconds: number;
    url: string;
};

function formatCertificateParty(input: Record<string, string> | undefined): string | null {
    if (!input) {
        return null;
    }

    if (input.CN) {
        return input.CN;
    }

    const pairs = Object.entries(input).filter(([, value]) => Boolean(value));
    if (pairs.length === 0) {
        return null;
    }

    return pairs.map(([key, value]) => `${key}=${value}`).join(', ');
}

function hasPeerCertificateReader(value: unknown): value is { getPeerCertificate: () => unknown } {
    return typeof value === 'object'
        && value !== null
        && 'getPeerCertificate' in value
        && typeof value.getPeerCertificate === 'function';
}

function extractPeerCertificate(response: ResponseWithSocket): PeerCertificateLike | null {
    const socket = response?.request?.res?.socket
        || response?.request?.socket
        || response?.socket;

    if (!hasPeerCertificateReader(socket)) {
        return null;
    }

    const certificate = socket.getPeerCertificate();
    if (typeof certificate !== 'object' || certificate === null || Object.keys(certificate).length === 0) {
        return null;
    }

    return certificate as PeerCertificateLike;
}

function buildSslSnapshot(certificate: PeerCertificateLike): SslCheckSnapshot {
    const validTo = certificate?.valid_to ? new Date(certificate.valid_to) : null;
    const expiresAt = validTo && !Number.isNaN(validTo.getTime()) ? validTo : null;

    return {
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        daysRemaining: expiresAt
            ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000)
            : null,
        issuer: formatCertificateParty(certificate?.issuer),
        subject: formatCertificateParty(certificate?.subject),
    };
}

function extractSslSnapshot(response: ResponseWithSocket): SslCheckSnapshot | null {
    const certificate = extractPeerCertificate(response);
    if (!certificate) {
        return null;
    }

    return buildSslSnapshot(certificate);
}

async function fetchSslSnapshotFromTls(targetUrl: string, timeoutMs: number): Promise<SslCheckSnapshot | null> {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') {
        return null;
    }

    const hostname = parsed.hostname;
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443;

    return await new Promise<SslCheckSnapshot | null>((resolve, reject) => {
        let settled = false;
        const finalize = (fn: () => void) => {
            if (settled) {
                return;
            }
            settled = true;
            fn();
        };

        const socket = tls.connect({
            host: hostname,
            port,
            servername: hostname,
            rejectUnauthorized: false,
        });

        socket.setTimeout(timeoutMs);

        socket.once('secureConnect', () => {
            finalize(() => {
                try {
                    const certificate = socket.getPeerCertificate();
                    socket.end();

                    if (!certificate || Object.keys(certificate).length === 0) {
                        resolve(null);
                        return;
                    }

                    resolve(buildSslSnapshot(certificate as PeerCertificateLike));
                } catch (err) {
                    reject(err);
                }
            });
        });

        socket.once('timeout', () => {
            finalize(() => {
                socket.destroy();
                reject(new Error(`TLS handshake timed out after ${timeoutMs}ms`));
            });
        });

        socket.once('error', (err) => {
            finalize(() => {
                socket.destroy();
                reject(err);
            });
        });
    });
}

export async function resolveSslSnapshot(input: SslSnapshotInput, response: ResponseWithSocket): Promise<SslCheckSnapshot | null> {
    if (!input.sslExpiryEnabled) {
        return null;
    }

    const targetUrl = typeof response?.request?.res?.responseUrl === 'string'
        ? response.request.res.responseUrl
        : input.url;
    const protocol = new URL(targetUrl).protocol;

    if (protocol !== 'https:') {
        return null;
    }

    return extractSslSnapshot(response) || await fetchSslSnapshotFromTls(targetUrl, input.timeoutSeconds * 1000);
}
