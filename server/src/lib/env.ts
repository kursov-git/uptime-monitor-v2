import { z } from 'zod';
import { parseBoolEnv } from './utils';
import { resolveServerRole, type ServerRole } from './serverRoles';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
const LOG_FORMATS = ['pretty', 'json'] as const;

const rawEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().optional(),
    CORS_ORIGINS: z.string().optional(),
    HOST: z.string().trim().min(1).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    ENABLE_AGENT_API: z.string().optional(),
    AGENT_SSE_ENABLED: z.string().optional(),
    ENABLE_BUILTIN_WORKER: z.string().optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    LOG_FORMAT: z.enum(LOG_FORMATS).optional(),
    SERVER_ROLE: z.string().optional(),
});

export interface ServerEnv {
    nodeEnv: 'development' | 'test' | 'production';
    databaseUrl: string;
    jwtSecret: string;
    corsOrigins: string[];
    host: string;
    port: number;
    enableAgentApi: boolean;
    agentSseEnabled: boolean;
    enableBuiltinWorker: boolean;
    logLevel: (typeof LOG_LEVELS)[number];
    logFormat: (typeof LOG_FORMATS)[number];
    serverRole: ServerRole;
}

function defaultJwtSecret(nodeEnv: ServerEnv['nodeEnv']): string {
    if (nodeEnv === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
    }

    return 'development-secret-change-in-production';
}

export function readServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
    const raw = rawEnvSchema.parse(source);
    const nodeEnv = raw.NODE_ENV ?? 'development';
    const jwtSecret = raw.JWT_SECRET?.trim() || defaultJwtSecret(nodeEnv);

    return {
        nodeEnv,
        databaseUrl: raw.DATABASE_URL,
        jwtSecret,
        corsOrigins: raw.CORS_ORIGINS
            ? raw.CORS_ORIGINS.split(',').map((entry) => entry.trim()).filter(Boolean)
            : ['http://localhost:5173'],
        host: raw.HOST ?? '0.0.0.0',
        port: raw.PORT ?? 3000,
        enableAgentApi: parseBoolEnv(raw.ENABLE_AGENT_API, true),
        agentSseEnabled: parseBoolEnv(raw.AGENT_SSE_ENABLED, true),
        enableBuiltinWorker: parseBoolEnv(raw.ENABLE_BUILTIN_WORKER, true),
        logLevel: raw.LOG_LEVEL ?? (nodeEnv === 'test' ? 'warn' : 'info'),
        logFormat: raw.LOG_FORMAT ?? (nodeEnv === 'production' ? 'json' : 'pretty'),
        serverRole: resolveServerRole(raw.SERVER_ROLE),
    };
}

export function validateServerEnv(): ServerEnv {
    return readServerEnv();
}

export const serverEnv = validateServerEnv();
