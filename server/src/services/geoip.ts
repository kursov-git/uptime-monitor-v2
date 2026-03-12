import geoip from 'geoip-lite';

export interface AgentGeoSnapshot {
    ip: string | null;
    country: string | null;
    city: string | null;
}

function normalizeIp(rawIp: string | null | undefined): string | null {
    if (!rawIp) {
        return null;
    }

    const trimmed = rawIp.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('::ffff:')) {
        return trimmed.slice('::ffff:'.length);
    }

    return trimmed;
}

export function resolveAgentGeo(rawIp: string | null | undefined): AgentGeoSnapshot {
    const ip = normalizeIp(rawIp);
    if (!ip) {
        return {
            ip: null,
            country: null,
            city: null,
        };
    }

    const record = geoip.lookup(ip);
    return {
        ip,
        country: record?.country ?? null,
        city: record?.city ?? null,
    };
}
