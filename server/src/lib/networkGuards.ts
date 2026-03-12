import net from 'node:net';

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

function getBlockedAddressReason(address: string): string | null {
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

export function getBlockedTargetReasonFromUrl(url: string, options: { allowPrivateTargets?: boolean } = {}): string | null {
    if (options.allowPrivateTargets) {
        return null;
    }

    const parsed = new URL(url);
    const hostname = normalizeHostname(parsed.hostname);

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        return 'loopback';
    }

    if (hostname === 'metadata.google.internal') {
        return 'metadata';
    }

    return getBlockedAddressReason(hostname);
}
