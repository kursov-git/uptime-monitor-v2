import { z } from 'zod';

const envSchema = z.object({
    MAIN_SERVER_URL: z.string().url(),
    AGENT_TOKEN: z.string().min(1),
    AGENT_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    AGENT_BUFFER_MAX: z.coerce.number().int().positive().optional(),
    AGENT_RESULT_MAX_BATCH: z.coerce.number().int().positive().optional(),
    AGENT_MAX_CONCURRENCY: z.coerce.number().int().positive().optional(),
    ALLOW_PRIVATE_MONITOR_TARGETS: z.string().optional(),
});

const VERSIONED_ENCRYPTION_KEY_RE = /^ENCRYPTION_KEY_(\d+)$/;
const ENCRYPTION_KEY_HEX_RE = /^[0-9a-fA-F]{64}$/;

export interface AgentKeySource {
    encryptionKeysByVersion: Record<number, string>;
    fallbackEncryptionKey: string | null;
}

export interface AgentEnv extends AgentKeySource {
    mainServerUrl: string;
    agentToken: string;
    httpTimeoutMs: number;
    bufferMax: number;
    resultMaxBatch: number;
    maxConcurrency: number;
    allowPrivateMonitorTargets: boolean;
}

function readEncryptionKey(name: string, value: string): string {
    if (!ENCRYPTION_KEY_HEX_RE.test(value)) {
        throw new Error(`${name} must be a 64-character hex string`);
    }
    return value;
}

export function readAgentKeySource(source: NodeJS.ProcessEnv = process.env): AgentKeySource {
    const encryptionKeysByVersion: Record<number, string> = {};

    for (const [name, value] of Object.entries(source)) {
        if (!value) continue;

        const match = name.match(VERSIONED_ENCRYPTION_KEY_RE);
        if (!match) continue;

        const version = Number.parseInt(match[1], 10);
        if (version < 1) {
            throw new Error(`${name} must use a positive key version`);
        }

        encryptionKeysByVersion[version] = readEncryptionKey(name, value);
    }

    return {
        encryptionKeysByVersion,
        fallbackEncryptionKey: source.ENCRYPTION_KEY
            ? readEncryptionKey('ENCRYPTION_KEY', source.ENCRYPTION_KEY)
            : null,
    };
}

export function readAgentEnv(source: NodeJS.ProcessEnv = process.env): AgentEnv {
    const raw = envSchema.parse(source);
    const keySource = readAgentKeySource(source);

    return {
        mainServerUrl: raw.MAIN_SERVER_URL.replace(/\/$/, ''),
        agentToken: raw.AGENT_TOKEN,
        httpTimeoutMs: raw.AGENT_HTTP_TIMEOUT_MS ?? 7000,
        bufferMax: raw.AGENT_BUFFER_MAX ?? 200,
        resultMaxBatch: raw.AGENT_RESULT_MAX_BATCH ?? 50,
        maxConcurrency: raw.AGENT_MAX_CONCURRENCY ?? 6,
        allowPrivateMonitorTargets: raw.ALLOW_PRIVATE_MONITOR_TARGETS === 'true',
        ...keySource,
    };
}

export function getAgentEnv(source: NodeJS.ProcessEnv = process.env): AgentEnv {
    return readAgentEnv(source);
}
