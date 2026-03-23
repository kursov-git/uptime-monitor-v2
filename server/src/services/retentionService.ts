import { PrismaClient } from '@prisma/client';
import { ensurePrismaSqliteTuned } from '../lib/prisma';
import { logger } from '../lib/logger';

const retentionLogger = logger.child({ component: 'retention-service' });

const RETENTION_DELETE_BATCH_SIZE = 250;
const RETENTION_DELETE_BATCH_PAUSE_MS = 25;
const RETENTION_BUSY_RETRY_LIMIT = 3;
const RETENTION_BUSY_RETRY_BASE_MS = 100;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSqliteBusyError(err: unknown): boolean {
    if (!(err instanceof Error)) {
        return false;
    }

    return /SQLITE_BUSY|database is locked/i.test(err.message);
}

type BatchDeleteSummary = {
    deletedCount: number;
    batches: number;
    busyRetries: number;
};

type TimestampedRecordId = { id: string };

export class RetentionService {
    private prisma: PrismaClient;
    private interval: NodeJS.Timeout | null = null;
    private lastRunAt: string | null = null;
    private lastDurationMs: number | null = null;
    private lastRetentionDays: number | null = null;
    private lastDeletedCheckResults = 0;
    private lastDeletedAuditLogs = 0;
    private lastDeletedNotificationHistory = 0;
    private lastDeleteBatchCount = 0;
    private lastBusyRetryCount = 0;
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
            lastDeleteBatchCount: this.lastDeleteBatchCount,
            lastBusyRetryCount: this.lastBusyRetryCount,
            lastError: this.lastError,
        };
    }

    private async withSqliteBusyRetry<T>(
        label: string,
        operation: () => Promise<T>,
        onRetry: () => void,
    ): Promise<T> {
        let attempt = 0;

        while (true) {
            try {
                return await operation();
            } catch (err) {
                if (!isSqliteBusyError(err) || attempt >= RETENTION_BUSY_RETRY_LIMIT) {
                    throw err;
                }

                attempt += 1;
                onRetry();

                const delayMs = RETENTION_BUSY_RETRY_BASE_MS * attempt;
                retentionLogger.warn({ label, attempt, delayMs }, 'SQLite busy during retention cleanup, retrying');
                await sleep(delayMs);
            }
        }
    }

    private async deleteByTimestampBatches(
        label: 'checkResult' | 'auditLog' | 'notificationHistory',
        cutoffDate: Date,
    ): Promise<BatchDeleteSummary> {
        let deletedCount = 0;
        let batches = 0;
        let busyRetries = 0;

        while (true) {
            const rows = await this.withSqliteBusyRetry(
                `${label}.find`,
                async () => this.findBatchIds(label, cutoffDate),
                () => { busyRetries += 1; },
            );

            if (rows.length === 0) {
                break;
            }

            const result = await this.withSqliteBusyRetry(
                `${label}.delete`,
                async () => this.deleteBatchIds(label, rows.map((row) => row.id)),
                () => { busyRetries += 1; },
            );

            deletedCount += result.count;
            batches += 1;

            if (rows.length < RETENTION_DELETE_BATCH_SIZE) {
                break;
            }

            await sleep(RETENTION_DELETE_BATCH_PAUSE_MS);
        }

        return { deletedCount, batches, busyRetries };
    }

    private findBatchIds(
        label: 'checkResult' | 'auditLog' | 'notificationHistory',
        cutoffDate: Date,
    ): Promise<TimestampedRecordId[]> {
        switch (label) {
        case 'checkResult':
            return this.prisma.checkResult.findMany({
                where: { timestamp: { lt: cutoffDate } },
                select: { id: true },
                orderBy: { timestamp: 'asc' },
                take: RETENTION_DELETE_BATCH_SIZE,
            });
        case 'auditLog':
            return this.prisma.auditLog.findMany({
                where: { timestamp: { lt: cutoffDate } },
                select: { id: true },
                orderBy: { timestamp: 'asc' },
                take: RETENTION_DELETE_BATCH_SIZE,
            });
        case 'notificationHistory':
            return this.prisma.notificationHistory.findMany({
                where: { timestamp: { lt: cutoffDate } },
                select: { id: true },
                orderBy: { timestamp: 'asc' },
                take: RETENTION_DELETE_BATCH_SIZE,
            });
        }
    }

    private deleteBatchIds(
        label: 'checkResult' | 'auditLog' | 'notificationHistory',
        ids: string[],
    ): Promise<{ count: number }> {
        switch (label) {
        case 'checkResult':
            return this.prisma.checkResult.deleteMany({
                where: {
                    id: { in: ids },
                },
            });
        case 'auditLog':
            return this.prisma.auditLog.deleteMany({
                where: {
                    id: { in: ids },
                },
            });
        case 'notificationHistory':
            return this.prisma.notificationHistory.deleteMany({
                where: {
                    id: { in: ids },
                },
            });
        }
    }

    private async cleanup() {
        const startedAt = Date.now();
        this.lastDeleteBatchCount = 0;
        this.lastBusyRetryCount = 0;

        try {
            await ensurePrismaSqliteTuned();

            // Get retention days from settings
            const settings = await this.prisma.notificationSettings.findFirst();
            const retentionDays = settings?.retentionDays || 30;
            this.lastRetentionDays = retentionDays;

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const checkResults = await this.deleteByTimestampBatches('checkResult', cutoffDate);
            if (checkResults.deletedCount > 0) {
                retentionLogger.info({
                    deletedCount: checkResults.deletedCount,
                    batches: checkResults.batches,
                    busyRetries: checkResults.busyRetries,
                    retentionDays,
                }, 'Deleted old check results');
            }
            this.lastDeletedCheckResults = checkResults.deletedCount;

            const auditLogs = await this.deleteByTimestampBatches('auditLog', cutoffDate);
            if (auditLogs.deletedCount > 0) {
                retentionLogger.info({
                    deletedCount: auditLogs.deletedCount,
                    batches: auditLogs.batches,
                    busyRetries: auditLogs.busyRetries,
                    retentionDays,
                }, 'Deleted old audit logs');
            }
            this.lastDeletedAuditLogs = auditLogs.deletedCount;

            const notificationHistory = await this.deleteByTimestampBatches('notificationHistory', cutoffDate);
            if (notificationHistory.deletedCount > 0) {
                retentionLogger.info({
                    deletedCount: notificationHistory.deletedCount,
                    batches: notificationHistory.batches,
                    busyRetries: notificationHistory.busyRetries,
                    retentionDays,
                }, 'Deleted old notification history');
            }
            this.lastDeletedNotificationHistory = notificationHistory.deletedCount;
            this.lastDeleteBatchCount = checkResults.batches + auditLogs.batches + notificationHistory.batches;
            this.lastBusyRetryCount = checkResults.busyRetries + auditLogs.busyRetries + notificationHistory.busyRetries;
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
