import dns from 'node:dns/promises';
import net from 'node:net';

export interface TargetGuardOptions {
    allowPrivateTargets?: boolean;
}

export interface CheckTargetValidationOptions extends TargetGuardOptions {
    lookup?: typeof dns.lookup;
}

type TargetLabel = 'primary' | 'auth';

const METADATA_HOSTNAMES = new Set([
    'metadata.google.internal',
]);

function normalizeHostname(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/\.+$/, '');
}

function parseIpv4(address: string): number[] | null {
    const parts = address.split('.');
    if (parts.length !== 4) {
        return null;
    }

    const octets = parts.map((part) => Number(part));
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return null;
    }

    return octets;
}

function isIpv4MappedIpv6(address: string): string | null {
    const normalized = address.toLowerCase();
    if (!normalized.startsWith('::ffff:')) {
        return null;
    }

    return normalized.slice('::ffff:'.length);
}

export function getBlockedAddressReason(address: string): string | null {
    const mappedIpv4 = isIpv4MappedIpv6(address);
    if (mappedIpv4) {
        return getBlockedAddressReason(mappedIpv4);
    }

    const ipVersion = net.isIP(address);
    if (!ipVersion) {
        return null;
    }

    if (ipVersion === 4) {
        const octets = parseIpv4(address);
        if (!octets) {
            return null;
        }

        const [first, second] = octets;

        if (first === 127) {
            return 'loopback';
        }

        if (first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)) {
            return 'rfc1918-private';
        }

        if (first === 169 && second === 254) {
            return address === '169.254.169.254' ? 'metadata' : 'link-local';
        }

        return null;
    }

    const normalized = address.toLowerCase();
    if (normalized === '::1') {
        return 'loopback';
    }

    if (normalized === '::') {
        return 'link-local';
    }

    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
        return 'link-local';
    }

    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
        return 'rfc4193-private';
    }

    return null;
}

export function getBlockedHostnameReason(hostname: string): string | null {
    const normalized = normalizeHostname(hostname);
    if (!normalized) {
        return null;
    }

    if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
        return 'loopback';
    }

    if (METADATA_HOSTNAMES.has(normalized)) {
        return 'metadata';
    }

    return getBlockedAddressReason(normalized);
}

export function getBlockedTargetReasonFromUrl(url: string, options: TargetGuardOptions = {}): string | null {
    if (options.allowPrivateTargets) {
        return null;
    }

    const parsed = new URL(url);
    return getBlockedHostnameReason(parsed.hostname);
}

export async function assertSafeCheckTargets(
    targets: Array<{ label: TargetLabel; url: string | null | undefined }>,
    options: CheckTargetValidationOptions = {}
): Promise<void> {
    if (options.allowPrivateTargets) {
        return;
    }

    const lookup = options.lookup ?? dns.lookup;

    for (const target of targets) {
        if (!target.url) {
            continue;
        }

        const parsed = new URL(target.url);
        const blockedHostnameReason = getBlockedHostnameReason(parsed.hostname);
        if (blockedHostnameReason) {
            throw new Error(`${target.label} target is not allowed: ${blockedHostnameReason}`);
        }

        if (net.isIP(parsed.hostname)) {
            continue;
        }

        try {
            const resolved = await lookup(parsed.hostname, { all: true, verbatim: true });
            for (const entry of resolved) {
                const blockedAddressReason = getBlockedAddressReason(entry.address);
                if (blockedAddressReason) {
                    throw new Error(`${target.label} target resolves to a disallowed address: ${entry.address} (${blockedAddressReason})`);
                }
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('disallowed address')) {
                throw error;
            }
        }
    }
}
