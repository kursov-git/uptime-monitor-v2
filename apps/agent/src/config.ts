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

export interface AgentEnv {
    mainServerUrl: string;
    agentToken: string;
    httpTimeoutMs: number;
    bufferMax: number;
    resultMaxBatch: number;
    maxConcurrency: number;
    allowPrivateMonitorTargets: boolean;
}

export function readAgentEnv(source: NodeJS.ProcessEnv = process.env): AgentEnv {
    const raw = envSchema.parse(source);

    return {
        mainServerUrl: raw.MAIN_SERVER_URL.replace(/\/$/, ''),
        agentToken: raw.AGENT_TOKEN,
        httpTimeoutMs: raw.AGENT_HTTP_TIMEOUT_MS ?? 7000,
        bufferMax: raw.AGENT_BUFFER_MAX ?? 200,
        resultMaxBatch: raw.AGENT_RESULT_MAX_BATCH ?? 50,
        maxConcurrency: raw.AGENT_MAX_CONCURRENCY ?? 6,
        allowPrivateMonitorTargets: raw.ALLOW_PRIVATE_MONITOR_TARGETS === 'true',
    };
}

export const agentEnv = readAgentEnv();
