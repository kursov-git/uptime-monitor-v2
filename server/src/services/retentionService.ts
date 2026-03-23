import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

const retentionLogger = logger.child({ component: 'retention-service' });

export class RetentionService {
    private prisma: PrismaClient;
    private interval: NodeJS.Timeout | null = null;
    private lastRunAt: string | null = null;
    private lastDurationMs: number | null = null;
    private lastRetentionDays: number | null = null;
    private lastDeletedCheckResults = 0;
    private lastDeletedAuditLogs = 0;
    private lastDeletedNotificationHistory = 0;
    private lastError: string | null = null;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    start() {
        retentionLogger.info('RetentionService started');
        // Run cleanup immediately and then every hour
        this.cleanup();
        this.interval = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        retentionLogger.info('RetentionService stopped');
    }

    getStatus() {
        return {
            running: this.interval !== null,
            lastRunAt: this.lastRunAt,
            lastDurationMs: this.lastDurationMs,
            lastRetentionDays: this.lastRetentionDays,
            lastDeletedCheckResults: this.lastDeletedCheckResults,
            lastDeletedAuditLogs: this.lastDeletedAuditLogs,
            lastDeletedNotificationHistory: this.lastDeletedNotificationHistory,
            lastError: this.lastError,
        };
    }

    private async cleanup() {
        const startedAt = Date.now();
        try {
            // Get retention days from settings
            const settings = await this.prisma.notificationSettings.findFirst();
            const retentionDays = settings?.retentionDays || 30;
            this.lastRetentionDays = retentionDays;

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const result = await this.prisma.checkResult.deleteMany({
                where: {
                    timestamp: { lt: cutoffDate },
                },
            });

            if (result.count > 0) {
                retentionLogger.info({ deletedCount: result.count, retentionDays }, 'Deleted old check results');
            }
            this.lastDeletedCheckResults = result.count;

            // Clean old audit logs (same retention period)
            const auditResult = await this.prisma.auditLog.deleteMany({
                where: {
                    timestamp: { lt: cutoffDate },
                },
            });

            if (auditResult.count > 0) {
                retentionLogger.info({ deletedCount: auditResult.count, retentionDays }, 'Deleted old audit logs');
            }
            this.lastDeletedAuditLogs = auditResult.count;

            // Clean old notification history (same retention period)
            const notifResult = await this.prisma.notificationHistory.deleteMany({
                where: {
                    timestamp: { lt: cutoffDate },
                },
            });

            if (notifResult.count > 0) {
                retentionLogger.info({ deletedCount: notifResult.count, retentionDays }, 'Deleted old notification history');
            }
            this.lastDeletedNotificationHistory = notifResult.count;
            this.lastRunAt = new Date().toISOString();
            this.lastDurationMs = Date.now() - startedAt;
            this.lastError = null;

        } catch (err) {
            this.lastRunAt = new Date().toISOString();
            this.lastDurationMs = Date.now() - startedAt;
            this.lastError = err instanceof Error ? err.message : String(err);
            retentionLogger.error({ err }, 'Retention cleanup error');
        }
    }
}
