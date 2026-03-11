export const SERVER_ROLES = ['api', 'worker', 'retention', 'agent-offline-monitor'] as const;

export type ServerRole = (typeof SERVER_ROLES)[number] | 'all';

const SERVER_ROLE_SET = new Set<string>(SERVER_ROLES);

export function resolveServerRole(raw = process.env.SERVER_ROLE): ServerRole {
    const normalized = (raw || 'all').trim().toLowerCase();

    if (normalized === 'all') {
        return 'all';
    }

    if (SERVER_ROLE_SET.has(normalized)) {
        return normalized as Exclude<ServerRole, 'all'>;
    }

    throw new Error(
        `Invalid SERVER_ROLE "${raw}". Expected one of: all, ${SERVER_ROLES.join(', ')}`
    );
}
