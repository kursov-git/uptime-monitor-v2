import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

const retentionLogger = logger.child({ component: 'retention-service' });

export class RetentionService {
    private prisma: PrismaClient;
    private interval: NodeJS.Timeout | null = null;

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
        };
    }

    private async cleanup() {
        try {
            // Get retention days from settings
            const settings = await this.prisma.notificationSettings.findFirst();
            const retentionDays = settings?.retentionDays || 30;

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

            // Clean old audit logs (same retention period)
            const auditResult = await this.prisma.auditLog.deleteMany({
                where: {
                    timestamp: { lt: cutoffDate },
                },
            });

            if (auditResult.count > 0) {
                retentionLogger.info({ deletedCount: auditResult.count, retentionDays }, 'Deleted old audit logs');
            }

            // Clean old notification history (same retention period)
            const notifResult = await this.prisma.notificationHistory.deleteMany({
                where: {
                    timestamp: { lt: cutoffDate },
                },
            });

            if (notifResult.count > 0) {
                retentionLogger.info({ deletedCount: notifResult.count, retentionDays }, 'Deleted old notification history');
            }

        } catch (err) {
            retentionLogger.error({ err }, 'Retention cleanup error');
        }
    }
}
