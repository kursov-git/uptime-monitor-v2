import { PrismaClient, Monitor } from '@prisma/client';
import { performCheck } from '@uptime-monitor/checker';
import { FlappingService } from './services/flapping';
import { sseService } from './services/sse';
import { decrypt } from './lib/crypto';
import { logger } from './lib/logger';

const workerLogger = logger.child({ component: 'check-worker' });

export class CheckWorker {
    private prisma: PrismaClient;
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private syncInterval: NodeJS.Timeout | null = null;
    private flappingService: FlappingService;
    private running = false;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.flappingService = new FlappingService(prisma);
    }

    async start() {
        this.running = true;
        workerLogger.info('CheckWorker starting');

        // Load all active monitors and schedule them
        const monitors = await this.prisma.monitor.findMany({
            where: { isActive: true, agentId: null },
        });

        for (const monitor of monitors) {
            this.scheduleMonitor(monitor);
        }

        workerLogger.info({ scheduledMonitors: monitors.length }, 'CheckWorker scheduled monitors');

        // Sync with DB every 30s for new/removed monitors
        this.syncInterval = setInterval(() => this.refreshSchedule(), 30000);
    }

    stop() {
        this.running = false;
        workerLogger.info('CheckWorker stopping');

        // Clear all timers
        for (const [id, timer] of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    getStatus() {
        return {
            running: this.running,
            scheduledMonitors: this.timers.size,
            syncLoopActive: this.syncInterval !== null,
        };
    }

    private scheduleMonitor(monitor: Monitor) {
        if (!this.running) return;

        const delayMs = monitor.intervalSeconds * 1000;

        const timer = setTimeout(async () => {
            if (!this.running) return;
            await this.performCheck(monitor);
            // Re-schedule after check completes
            // Re-fetch monitor to get latest settings
            try {
                const updated = await this.prisma.monitor.findUnique({
                    where: { id: monitor.id },
                });
                if (updated && updated.isActive && updated.agentId === null && this.running) {
                    this.scheduleMonitor(updated);
                } else {
                    this.timers.delete(monitor.id);
                }
            } catch (err) {

                workerLogger.error({ err, monitorId: monitor.id }, 'Failed to fetch monitor for rescheduling');
                this.timers.delete(monitor.id);
            }
        }, delayMs);

        this.timers.set(monitor.id, timer);
    }

    private async refreshSchedule() {
        if (!this.running) return;

        try {
            const activeMonitors = await this.prisma.monitor.findMany({
                where: { isActive: true, agentId: null },
            });

            const activeIds = new Set(activeMonitors.map(m => m.id));

            // Remove timers for monitors that are no longer active
            for (const [id, timer] of this.timers) {
                if (!activeIds.has(id)) {
                    clearTimeout(timer);
                    this.timers.delete(id);
                }
            }

            // Add timers for new monitors
            for (const monitor of activeMonitors) {
                if (!this.timers.has(monitor.id)) {
                    this.scheduleMonitor(monitor);
                }
            }
        } catch (err) {
            workerLogger.error({ err }, 'Error refreshing worker schedule');
        }
    }

    private async performCheck(monitor: Monitor) {
        const authPayload = monitor.authPayload ? decrypt(monitor.authPayload) : null;
        const result = await performCheck({
            url: monitor.url,
            method: monitor.method,
            timeoutSeconds: monitor.timeoutSeconds,
            expectedStatus: monitor.expectedStatus,
            expectedBody: monitor.expectedBody,
            headers: monitor.headers,
            authMethod: monitor.authMethod,
            authUrl: monitor.authUrl,
            authPayload,
            authTokenRegex: monitor.authTokenRegex,
        });

        // Store result
        try {
            await this.prisma.checkResult.create({
                data: {
                    monitorId: monitor.id,
                    isUp: result.isUp,
                    responseTimeMs: result.responseTimeMs,
                    statusCode: result.statusCode,
                    error: result.error,
                },
            });

            workerLogger.info({
                monitorId: monitor.id,
                monitorName: monitor.name,
                url: monitor.url,
                isUp: result.isUp,
                responseTimeMs: result.responseTimeMs,
                error: result.error ?? null,
            }, 'Monitor check completed');

            // Handle flapping/notifications
            await this.flappingService.handleCheckResult(monitor, result.isUp, result.error, {
                executorLabel: 'builtin worker',
                statusCode: result.statusCode,
                responseTimeMs: result.responseTimeMs,
            });

            // Broadcast the latest state to any connected clients
            // To ensure the UI accurately reflects any potential state changes (like DOWN)
            const updatedMonitor = await this.prisma.monitor.findUnique({
                where: { id: monitor.id }
            });
            if (updatedMonitor) {
                sseService.broadcast('monitor_update', updatedMonitor);
            }

        } catch (err) {
            workerLogger.error({ err, monitorId: monitor.id, monitorName: monitor.name }, 'Error saving check result');
        }
    }
}
