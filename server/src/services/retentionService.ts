import { PrismaClient } from '@prisma/client';

export class RetentionService {
    private prisma: PrismaClient;
    private interval: NodeJS.Timeout | null = null;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    start() {
        console.log('🗑️  RetentionService started (runs every hour).');
        // Run cleanup immediately and then every hour
        this.cleanup();
        this.interval = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log('⏹️  RetentionService stopped.');
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
                console.log(`🗑️  Retention cleanup: removed ${result.count} check results older than ${retentionDays} days.`);
            }

            // Clean old audit logs (same retention period)
            const auditResult = await this.prisma.auditLog.deleteMany({
                where: {
                    timestamp: { lt: cutoffDate },
                },
            });

            if (auditResult.count > 0) {
                console.log(`🗑️  Retention cleanup: removed ${auditResult.count} audit logs older than ${retentionDays} days.`);
            }

            // Clean old notification history (same retention period)
            const notifResult = await this.prisma.notificationHistory.deleteMany({
                where: {
                    timestamp: { lt: cutoffDate },
                },
            });

            if (notifResult.count > 0) {
                console.log(`🗑️  Retention cleanup: removed ${notifResult.count} notification history entries older than ${retentionDays} days.`);
            }

        } catch (err) {
            console.error('Retention cleanup error:', err);
        }
    }
}
