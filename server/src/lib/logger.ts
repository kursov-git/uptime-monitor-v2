import type { FastifyBaseLogger, FastifyServerOptions } from 'fastify';
import pino from 'pino';
import { serverEnv, type ServerEnv } from './env';

const SENSITIVE_QUERY_KEYS = new Set([
    'token',
    'access_token',
    'apikey',
    'api_key',
    'password',
]);

export function sanitizeUrlForLogs(rawUrl: string): string {
    const [path, query] = rawUrl.split('?', 2);
    if (!query) {
        return path;
    }

    const params = new URLSearchParams(query);
    let redacted = false;
    for (const key of params.keys()) {
        if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
            params.set(key, '[REDACTED]');
            redacted = true;
        }
    }

    return redacted ? `${path}?${params.toString()}` : rawUrl;
}

function buildPinoOptions(env: ServerEnv): pino.LoggerOptions {
    const options: pino.LoggerOptions = {
        level: env.logLevel,
        base: undefined,
        timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (env.logFormat === 'pretty') {
        options.transport = {
            target: 'pino-pretty',
            options: {
                colorize: env.nodeEnv !== 'test',
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        };
    }

    return options;
}

export function createLogger(env = serverEnv): FastifyBaseLogger {
    return pino(buildPinoOptions(env));
}

export function createFastifyLoggerOptions(env = serverEnv): FastifyServerOptions['logger'] {
    const options = buildPinoOptions(env);
    return {
        ...options,
        serializers: {
            req(request) {
                return {
                    method: request.method,
                    url: sanitizeUrlForLogs(request.url),
                    host: request.host,
                    remoteAddress: request.ip,
                    remotePort: request.socket?.remotePort,
                };
            },
        },
    };
}

export const logger = createLogger();
