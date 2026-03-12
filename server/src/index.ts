import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import prisma from './lib/prisma';
import { CheckWorker } from './worker';
import { RetentionService } from './services/retentionService';
import { AgentOfflineMonitorService } from './services/agentOfflineMonitor';
import monitorRoutes from './routes/monitors';
import agentRoutes from './routes/agent';
import agentsRoutes from './routes/agents';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import apikeyRoutes from './routes/apikeys';
import auditRoutes from './routes/audit';
import notificationRoutes from './routes/notifications';
import { validateEncryptionConfig } from './lib/crypto';
import { type ServerRole } from './lib/serverRoles';
import { createFastifyLoggerOptions, logger } from './lib/logger';
import { serverEnv } from './lib/env';
import { backfillLegacyApiKeys } from './services/apiKeys';
import { SESSION_JWT_EXPIRES_IN } from './lib/auth';

const env = serverEnv;

const fastify = Fastify({
    logger: createFastifyLoggerOptions(env),
});


// Register plugins
async function registerPlugins() {
    await fastify.register(helmet, {
        contentSecurityPolicy: false, // handled by Nginx
    });

    await fastify.register(cors, {
        origin: env.corsOrigins,
        credentials: true,
    });

    await fastify.register(jwt, {
        secret: env.jwtSecret,
        sign: { expiresIn: SESSION_JWT_EXPIRES_IN },
    });

    await fastify.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
    });
}

// Health check
fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

fastify.get('/health/runtime', async () => {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        serverRole: env.serverRole,
        runtime: {
            agentApiEnabled: env.enableAgentApi,
            agentSseEnabled: env.agentSseEnabled,
            builtinWorkerEnabled: env.enableBuiltinWorker,
        },
        services: {
            worker: worker.getStatus(),
            retention: retentionService.getStatus(),
            agentOfflineMonitor: agentOfflineMonitorService.getStatus(),
        },
    };
});

// Register routes
async function registerRoutes() {
    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(monitorRoutes, { prefix: '/api/monitors' });
    if (env.enableAgentApi) {
        fastify.log.info({ AGENT_SSE_ENABLED: env.agentSseEnabled }, 'Agent API enabled');
        await fastify.register(agentRoutes, { prefix: '/api/agent' });
        await fastify.register(agentsRoutes, { prefix: '/api/agents' });
    }
    await fastify.register(userRoutes, { prefix: '/api/users' });
    await fastify.register(apikeyRoutes, { prefix: '/api/apikeys' });
    await fastify.register(auditRoutes, { prefix: '/api/audit' });
    await fastify.register(notificationRoutes, { prefix: '/api/notifications' });
}

// Export init logic for testing
export async function initApp() {
    const migratedApiKeys = await backfillLegacyApiKeys();
    await registerPlugins();
    await registerRoutes();
    if (migratedApiKeys > 0) {
        fastify.log.warn({ migratedApiKeys }, 'Backfilled legacy plaintext API keys');
    }
    return fastify;
}

const worker = new CheckWorker(prisma);
const retentionService = new RetentionService(prisma);
const agentOfflineMonitorService = new AgentOfflineMonitorService();
let shutdownPromise: Promise<void> | null = null;

async function startApiServer() {
    await initApp();
    await fastify.listen({ port: env.port, host: env.host });
    fastify.log.info({ host: env.host, port: env.port }, 'API server listening');
}

async function startBackgroundRole(role: Exclude<ServerRole, 'all' | 'api'>) {
    if (role === 'worker') {
        await worker.start();
        return;
    }

    if (role === 'retention') {
        retentionService.start();
        return;
    }

    if (role === 'agent-offline-monitor') {
        if (!env.enableAgentApi) {
            fastify.log.warn('Skipping agent-offline-monitor role because ENABLE_AGENT_API=false');
            return;
        }

        agentOfflineMonitorService.start();
    }
}

async function start() {
    try {
        if (!process.env.JWT_SECRET && env.nodeEnv !== 'production') {
            logger.warn('Using default JWT secret. This is not suitable for production.');
        }
        validateEncryptionConfig();
        fastify.log.info({ serverRole: env.serverRole }, 'Starting runtime');

        if (env.serverRole === 'all' || env.serverRole === 'api') {
            await startApiServer();
        }

        if (env.serverRole === 'all') {
            if (env.enableBuiltinWorker) {
                await worker.start();
            } else {
                fastify.log.info('Builtin worker disabled by ENABLE_BUILTIN_WORKER=false');
            }

            retentionService.start();

            if (env.enableAgentApi) {
                agentOfflineMonitorService.start();
            }
        } else if (env.serverRole !== 'api') {
            await startBackgroundRole(env.serverRole);
        }

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

// Graceful shutdown
async function shutdown(signal: string) {
    if (shutdownPromise) {
        return shutdownPromise;
    }

    shutdownPromise = (async () => {
        fastify.log.info({ signal }, 'Shutting down gracefully');
        worker.stop();
        retentionService.stop();
        agentOfflineMonitorService.stop();
        await fastify.close();
        await prisma.$disconnect();
        fastify.log.info('Server stopped');
        process.exit(0);
    })();

    return shutdownPromise;
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
    start();
}

export { fastify, prisma };
