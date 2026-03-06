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
import { envBool } from './lib/utils';

// JWT secret validation
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
    }
    console.warn('⚠️  Using default JWT secret — NOT suitable for production!');
    return 'development-secret-change-in-production';
})();

const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:5173'];
const ENABLE_AGENT_API = envBool('ENABLE_AGENT_API', true);
const AGENT_SSE_ENABLED = envBool('AGENT_SSE_ENABLED', true);
const ENABLE_BUILTIN_WORKER = envBool('ENABLE_BUILTIN_WORKER', true);

const fastify = Fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: { colorize: true },
        },
    },
});


// Register plugins
async function registerPlugins() {
    await fastify.register(helmet, {
        contentSecurityPolicy: false, // handled by Nginx
    });

    await fastify.register(cors, {
        origin: CORS_ORIGINS,
        credentials: true,
    });

    await fastify.register(jwt, {
        secret: JWT_SECRET,
        sign: { expiresIn: '24h' },
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

// Register routes
async function registerRoutes() {
    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(monitorRoutes, { prefix: '/api/monitors' });
    if (ENABLE_AGENT_API) {
        fastify.log.info({ AGENT_SSE_ENABLED }, 'Agent API enabled');
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
    await registerPlugins();
    await registerRoutes();
    return fastify;
}

const worker = new CheckWorker(prisma);
const retentionService = new RetentionService(prisma);
const agentOfflineMonitorService = new AgentOfflineMonitorService();

async function start() {
    try {
        await initApp();

        const port = Number(process.env.PORT) || 3000;
        const host = process.env.HOST || '0.0.0.0';

        await fastify.listen({ port, host });
        console.log(`🚀 Server running on http://${host}:${port}`);

        // Start background services
        if (ENABLE_BUILTIN_WORKER) {
            await worker.start();
        }
        retentionService.start();
        if (ENABLE_AGENT_API) {
            agentOfflineMonitorService.start();
        }

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

// Graceful shutdown
async function shutdown(signal: string) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    worker.stop();
    retentionService.stop();
    agentOfflineMonitorService.stop();
    await fastify.close();
    await prisma.$disconnect();
    console.log('👋 Server stopped.');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
    start();
}

export { fastify, prisma };
